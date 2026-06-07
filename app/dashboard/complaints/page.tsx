'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatTimestamp, ListPagination, ListToolbar, usePagedItems } from '@/components/list-tools'

interface Complaint {
  id: string
  title: string
  complaint_type: string
  status: string
  priority: string
  created_at: string
  resolution_notes?: string
  attachment_urls?: string[] | null
}

const BUCKET = 'complaint-attachments'
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [newComplaint, setNewComplaint] = useState({
    title: '',
    complaint_type: 'other',
    description: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchComplaints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchComplaints() {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error: err } = await supabase
        .from('complaints')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (err) throw err
      setComplaints(data || [])
    } catch (e) {
      console.error('Error fetching complaints:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setFile(null)
      return
    }
    if (!ACCEPTED.includes(f.type)) {
      setError('Attachment must be an image (PNG, JPG, WEBP, GIF) or PDF.')
      e.target.value = ''
      return
    }
    if (f.size > MAX_FILE_BYTES) {
      setError('Attachment must be under 10 MB.')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  async function uploadAttachment(userId: string): Promise<string | null> {
    if (!file) return null

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${Date.now()}-${safeName}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

    if (upErr) {
      throw new Error(`Upload failed: ${upErr.message}`)
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmitComplaint() {
    setError(null)
    setSubmitting(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('You must be signed in to submit a complaint.')
        return
      }

      let attachmentUrl: string | null = null
      if (file) {
        attachmentUrl = await uploadAttachment(user.id)
      }

      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintType: newComplaint.complaint_type,
          title: newComplaint.title,
          description: newComplaint.description,
          attachmentUrls: attachmentUrl ? [attachmentUrl] : [],
        }),
      })

      if (!response.ok) {
        const { error: err } = await response.json()
        throw new Error(err || 'Failed to submit complaint')
      }

      setNewComplaint({ title: '', complaint_type: 'other', description: '' })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchComplaints()
      toast.success('Complaint submitted', {
        description: 'We will review it and get back to you.',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error submitting complaint'
      setError(msg)
      toast.error('Could not submit complaint', { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      resolved: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800',
    }
    return colors[priority] || 'bg-gray-100 text-gray-800'
  }

  const filteredComplaints = useMemo(() => {
    const term = search.trim().toLowerCase()

    return complaints.filter((complaint) => {
      const matchesSearch =
        !term ||
        [
          complaint.title,
          complaint.complaint_type,
          complaint.status,
          complaint.priority,
          complaint.resolution_notes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return (
        matchesSearch &&
        (statusFilter === 'all' || complaint.status === statusFilter) &&
        (priorityFilter === 'all' || complaint.priority === priorityFilter)
      )
    })
  }, [complaints, search, statusFilter, priorityFilter])

  const { page, setPage, totalPages, pagedItems } = usePagedItems(
    filteredComplaints,
    6,
    `${search}|${statusFilter}|${priorityFilter}`,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Complaints & Disputes</h1>
        <p className="text-gray-600 mt-2">
          Submit and track complaints or disputes related to your account or transactions
        </p>
      </div>

      {/* Submit New Complaint */}
      <Card>
        <CardHeader>
          <CardTitle>Submit a Complaint</CardTitle>
          <CardDescription>
            Let us know about any issues you're experiencing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Complaint title"
              value={newComplaint.title}
              onChange={(e) =>
                setNewComplaint({ ...newComplaint, title: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              value={newComplaint.complaint_type}
              onChange={(e) =>
                setNewComplaint({ ...newComplaint, complaint_type: e.target.value })
              }
            >
              <option value="other">Other</option>
              <option value="unauthorized_transaction">Unauthorized Transaction</option>
              <option value="duplicate_charge">Duplicate Charge</option>
              <option value="failed_transaction">Failed Transaction</option>
              <option value="qr_payment_issue">QR Payment Issue</option>
              <option value="refund_issue">Refund Issue</option>
              <option value="account_access">Account Access</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Describe your complaint..."
              rows={4}
              value={newComplaint.description}
              onChange={(e) =>
                setNewComplaint({ ...newComplaint, description: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachment">Attachment (optional)</Label>
            <Input
              id="attachment"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              onChange={handleFileChange}
              ref={fileInputRef}
            />
            <p className="text-xs text-gray-500">
              Image (PNG/JPG/WEBP/GIF) or PDF, max 10 MB. Use this to share proof — receipts,
              screenshots, etc.
            </p>
            {file && (
              <p className="text-xs text-gray-700">
                Selected: <span className="font-medium">{file.name}</span> ({Math.round(file.size / 1024)} KB)
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="ml-2 text-red-600 underline"
                >
                  remove
                </button>
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmitComplaint}
            disabled={!newComplaint.title || !newComplaint.description || submitting}
            className="w-full"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Submitting…' : 'Submit Complaint'}
          </Button>
        </CardContent>
      </Card>

      {/* Complaints List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Complaints</CardTitle>
          <CardDescription>
            Track the status of your submitted complaints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {complaints.length > 0 && (
            <div className="mb-4">
              <ListToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search complaints"
                filters={[
                  {
                    label: 'Status',
                    value: statusFilter,
                    onChange: setStatusFilter,
                    options: [
                      { label: 'All', value: 'all' },
                      { label: 'Open', value: 'open' },
                      { label: 'In progress', value: 'in_progress' },
                      { label: 'Resolved', value: 'resolved' },
                      { label: 'Closed', value: 'closed' },
                      { label: 'Rejected', value: 'rejected' },
                    ],
                  },
                  {
                    label: 'Priority',
                    value: priorityFilter,
                    onChange: setPriorityFilter,
                    options: [
                      { label: 'All', value: 'all' },
                      { label: 'Low', value: 'low' },
                      { label: 'Medium', value: 'medium' },
                      { label: 'High', value: 'high' },
                      { label: 'Urgent', value: 'urgent' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {loading ? (
            <p className="text-center py-8 text-gray-600">Loading complaints...</p>
          ) : complaints.length === 0 ? (
            <p className="text-center py-8 text-gray-600">
              No complaints submitted yet
            </p>
          ) : filteredComplaints.length === 0 ? (
            <p className="text-center py-8 text-gray-600">
              No complaints match your search or filters.
            </p>
          ) : (
            <div className="space-y-4">
              {pagedItems.map((complaint) => {
                const attachments = complaint.attachment_urls ?? []
                return (
                  <div
                    key={complaint.id}
                    className="border border-gray-200 rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{complaint.title}</h3>
                        <p className="text-sm text-gray-600">
                          Submitted {formatTimestamp(complaint.created_at)}
                        </p>
                      </div>
                      <div className="space-x-2">
                        <Badge className={getStatusColor(complaint.status)}>
                          {complaint.status}
                        </Badge>
                        <Badge className={getPriorityColor(complaint.priority)}>
                          {complaint.priority}
                        </Badge>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <div className="pt-1">
                        <p className="text-xs font-medium text-gray-600 mb-1">Attachments</p>
                        <ul className="space-y-1">
                          {attachments.map((url) => {
                            const isImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
                            const filename = url.split('/').pop()?.split('?')[0] ?? 'attachment'
                            return (
                              <li key={url} className="flex items-center gap-2">
                                {isImage ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt={filename}
                                      className="h-16 w-16 object-cover rounded border"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 underline text-sm"
                                  >
                                    📄 {filename}
                                  </a>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {complaint.resolution_notes && (
                      <div className="mt-3 p-3 bg-green-50 rounded border border-green-200">
                        <p className="text-sm font-semibold text-green-800">Resolution:</p>
                        <p className="text-sm text-green-700">{complaint.resolution_notes}</p>
                      </div>
                    )}
                  </div>
                )
              })}
              <ListPagination
                page={page}
                totalPages={totalPages}
                totalItems={filteredComplaints.length}
                pageSize={6}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
