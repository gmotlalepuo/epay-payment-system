import { friendlyErrorResponse } from '@/lib/api-errors'
import { getAuthenticatedContext } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/notifications'
import { NextRequest, NextResponse } from 'next/server'

const BUCKET = 'profile-avatars'
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_FILE_BYTES = 5 * 1024 * 1024

function extensionForType(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/heic') return 'heic'
  if (type === 'image/heif') return 'heif'
  return 'jpg'
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized', userMessage: 'Please sign in again.' }, { status: 401 })
    }
    const { supabase, user } = auth
    const storageClient = createServiceRoleClient() ?? supabase

    const formData = await request.formData()
    const file = formData.get('avatar')

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: 'Avatar file is required.',
          userMessage: 'Please choose a profile picture to upload.',
        },
        { status: 422 },
      )
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: 'Unsupported avatar file type.',
          userMessage: 'Profile picture must be a JPG, PNG, WEBP, HEIC, or HEIF image.',
        },
        { status: 422 },
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: 'Avatar file is too large.',
          userMessage: 'Profile picture must be under 5 MB.',
        },
        { status: 422 },
      )
    }

    const extension = extensionForType(file.type)
    const path = `${user.id}/avatar.${extension}`
    const bytes = await file.arrayBuffer()

    const { data: buckets, error: bucketError } = await storageClient.storage.listBuckets()
    if (bucketError) {
      console.error('[profile-avatar] bucket lookup error:', bucketError)
      return friendlyErrorResponse(bucketError)
    }
    if (!buckets.some((bucket) => bucket.id === BUCKET)) {
      return NextResponse.json(
        {
          error: 'Profile avatar storage bucket is missing.',
          userMessage: 'Profile photo storage is not set up yet. Please run the latest Supabase migration and try again.',
        },
        { status: 500 },
      )
    }

    const { error: uploadError } = await storageClient.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    })

    if (uploadError) {
      console.error('[profile-avatar] upload error:', uploadError)
      return friendlyErrorResponse(uploadError)
    }

    const { data } = storageClient.storage.from(BUCKET).getPublicUrl(path)
    const avatarUrl = data.publicUrl

    const { data: profile, error: updateError } = await supabase
      .from('users')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('[profile-avatar] profile update error:', updateError)
      return friendlyErrorResponse(updateError)
    }

    return NextResponse.json({ profile, avatar_url: avatarUrl })
  } catch (error) {
    console.error('[profile-avatar] POST error:', error)
    return friendlyErrorResponse(error)
  }
}
