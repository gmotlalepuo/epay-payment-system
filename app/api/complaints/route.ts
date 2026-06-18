import { getAuthenticatedContext } from '@/lib/auth'
import { createNotification, notifyAdmins } from '@/lib/notifications'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/complaints - Create a new complaint
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { complaintType, title, description, transactionId, attachmentUrls } = await request.json()

    // Validate input
    if (!complaintType || !title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const validTypes = [
      'unauthorized_transaction',
      'duplicate_charge',
      'failed_transaction',
      'qr_payment_issue',
      'refund_issue',
      'account_access',
      'other',
    ]

    if (!validTypes.includes(complaintType)) {
      return NextResponse.json(
        { error: 'Invalid complaint type' },
        { status: 400 }
      )
    }

    // Create complaint
    const { data: complaint, error: complaintError } = await supabase
      .from('complaints')
      .insert({
        user_id: user.id,
        transaction_id: transactionId || null,
        complaint_type: complaintType,
        status: 'open',
        priority: 'medium',
        title,
        description,
        attachment_urls: attachmentUrls || [],
      })
      .select()
      .single()

    if (complaintError) {
      return NextResponse.json({ error: complaintError.message }, { status: 500 })
    }

    // Create notification
    await createNotification(supabase, {
      user_id: user.id,
      type: 'complaint',
      category: 'complaint',
      title: 'Complaint Submitted',
      message: `Your complaint has been submitted. We will review it shortly.`,
      link_url: '/dashboard/complaints',
      reference_id: complaint.id,
    })

    await notifyAdmins(supabase, {
      type: 'complaint',
      category: 'complaint',
      title: 'New complaint submitted',
      message: `A new complaint was filed by ${user.email}.`,
      link_url: '/admin',
      reference_id: complaint.id,
    })

    // Log the action
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'complaint_created',
      resource_type: 'complaint',
      resource_id: complaint.id,
      details: { complaint_type: complaintType, title },
      status: 'success',
    })

    return NextResponse.json(
      { complaint, message: 'Complaint submitted successfully' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating complaint:', error)
    return NextResponse.json(
      { error: 'Failed to create complaint' },
      { status: 500 }
    )
  }
}

// GET /api/complaints - Get user's complaints
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { data: complaints, error } = await supabase
      .from('complaints')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ complaints })
  } catch (error) {
    console.error('Error fetching complaints:', error)
    return NextResponse.json(
      { error: 'Failed to fetch complaints' },
      { status: 500 }
    )
  }
}
