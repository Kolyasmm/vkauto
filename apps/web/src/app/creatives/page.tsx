'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import {
  Upload,
  FolderPlus,
  Folder,
  Image as ImageIcon,
  Video,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  ChevronRight,
  MoreVertical,
  Download,
  Grid,
  List
} from 'lucide-react'
import clsx from 'clsx'

interface Creative {
  id: number
  filename: string
  storagePath: string
  mimeType: string
  fileSize: number
  width?: number
  height?: number
  name?: string
  description?: string
  folderId?: number
  createdAt: string
  folder?: CreativeFolder
}

interface CreativeFolder {
  id: number
  name: string
  _count?: {
    creatives: number
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CreativesPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [selectedCreatives, setSelectedCreatives] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<number | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Fetch folders
  const { data: folders = [] } = useQuery<CreativeFolder[]>({
    queryKey: ['creative-folders'],
    queryFn: async () => {
      const res = await api.get('/creatives/folders/list')
      return res.data
    },
  })

  // Fetch creatives
  const { data: creatives = [], isLoading } = useQuery<Creative[]>({
    queryKey: ['creatives', selectedFolder],
    queryFn: async () => {
      const params = selectedFolder !== null ? `?folderId=${selectedFolder}` : ''
      const res = await api.get(`/creatives${params}`)
      return res.data
    },
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      setUploading(true)
      setUploadProgress(0)

      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('files', file)
      })
      if (selectedFolder) {
        formData.append('folderId', String(selectedFolder))
      }

      const res = await api.post('/creatives/upload-multiple', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] })
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] })
      setUploading(false)
    },
    onError: () => {
      setUploading(false)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await api.post('/creatives/delete-multiple', { ids })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] })
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] })
      setSelectedCreatives(new Set())
    },
  })

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/creatives/folders', { name })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] })
      setIsCreatingFolder(false)
      setNewFolderName('')
    },
  })

  // Rename folder mutation
  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await api.put(`/creatives/folders/${id}`, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] })
      setEditingFolder(null)
    },
  })

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/creatives/folders/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] })
      queryClient.invalidateQueries({ queryKey: ['creatives'] })
      if (selectedFolder) setSelectedFolder(null)
    },
  })

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadMutation.mutate(e.target.files)
    }
  }, [uploadMutation])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadMutation.mutate(e.dataTransfer.files)
    }
  }, [uploadMutation])

  const toggleCreativeSelection = (id: number) => {
    const newSelection = new Set(selectedCreatives)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedCreatives(newSelection)
  }

  const selectAll = () => {
    if (selectedCreatives.size === creatives.length) {
      setSelectedCreatives(new Set())
    } else {
      setSelectedCreatives(new Set(creatives.map(c => c.id)))
    }
  }

  const getCreativeUrl = (creative: Creative) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''
    return `${process.env.NEXT_PUBLIC_API_URL}/creatives/${creative.id}/file?token=${token || ''}`
  }

  return (
    <Layout>
      <div className="max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Библиотека креативов</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Загружайте изображения и видео для использования в автозаливе
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="btn-outline p-2"
              title={viewMode === 'grid' ? 'Список' : 'Сетка'}
            >
              {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="btn-outline flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Папка</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary flex items-center gap-2"
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Загрузить</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar - Folders */}
          <div className="w-48 flex-shrink-0 hidden md:block">
            <div className="card p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Папки</h3>

              {/* All creatives */}
              <button
                onClick={() => setSelectedFolder(null)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors',
                  selectedFolder === null ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-100'
                )}
              >
                <Folder className="w-4 h-4" />
                <span>Все креативы</span>
              </button>

              {/* Root folder */}
              <button
                onClick={() => setSelectedFolder(0)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors',
                  selectedFolder === 0 ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-100'
                )}
              >
                <Folder className="w-4 h-4" />
                <span>Без папки</span>
              </button>

              {/* Folders list */}
              {folders.map((folder) => (
                <div key={folder.id} className="group relative">
                  {editingFolder === folder.id ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <input
                        type="text"
                        value={editFolderName}
                        onChange={(e) => setEditFolderName(e.target.value)}
                        className="input text-sm py-1 px-2 flex-1"
                        autoFocus
                      />
                      <button
                        onClick={() => renameFolderMutation.mutate({ id: folder.id, name: editFolderName })}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingFolder(null)}
                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedFolder(folder.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors',
                        selectedFolder === folder.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-100'
                      )}
                    >
                      <Folder className="w-4 h-4" />
                      <span className="flex-1 truncate">{folder.name}</span>
                      <span className="text-xs text-gray-400">{folder._count?.creatives || 0}</span>
                    </button>
                  )}

                  {/* Folder actions */}
                  {editingFolder !== folder.id && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                      <button
                        onClick={() => {
                          setEditingFolder(folder.id)
                          setEditFolderName(folder.name)
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Удалить папку? Креативы будут перемещены в корень.')) {
                            deleteFolderMutation.mutate(folder.id)
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Create folder form */}
              {isCreatingFolder && (
                <div className="flex items-center gap-1 px-2 py-1 mt-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Название папки"
                    className="input text-sm py-1 px-2 flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => createFolderMutation.mutate(newFolderName)}
                    disabled={!newFolderName.trim()}
                    className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingFolder(false)
                      setNewFolderName('')
                    }}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1">
            {/* Selection toolbar */}
            {selectedCreatives.size > 0 && (
              <div className="mb-4 p-3 bg-primary-50 rounded-lg flex items-center justify-between">
                <span className="text-sm text-primary-700">
                  Выбрано: {selectedCreatives.size}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {selectedCreatives.size === creatives.length ? 'Снять выбор' : 'Выбрать все'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Удалить ${selectedCreatives.size} креативов?`)) {
                        deleteMutation.mutate(Array.from(selectedCreatives))
                      }
                    }}
                    className="btn-outline text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </div>
              </div>
            )}

            {/* Upload progress */}
            {uploading && (
              <div className="mb-4 p-4 card">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                  <div className="flex-1">
                    <div className="text-sm text-gray-700">Загрузка файлов...</div>
                    <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-600 transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-gray-500">{uploadProgress}%</span>
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={clsx(
                'border-2 border-dashed rounded-lg transition-colors',
                'border-gray-200 hover:border-primary-400'
              )}
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : creatives.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Upload className="w-12 h-12 mb-4 text-gray-400" />
                  <p className="text-lg font-medium">Перетащите файлы сюда</p>
                  <p className="text-sm mt-1">или нажмите кнопку &quot;Загрузить&quot;</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
                  {creatives.map((creative) => (
                    <div
                      key={creative.id}
                      onClick={() => toggleCreativeSelection(creative.id)}
                      className={clsx(
                        'relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all',
                        selectedCreatives.has(creative.id)
                          ? 'border-primary-500 ring-2 ring-primary-200'
                          : 'border-transparent hover:border-gray-300'
                      )}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-square bg-gray-100 relative">
                        {creative.mimeType.startsWith('image/') ? (
                          <img
                            src={getCreativeUrl(creative)}
                            alt={creative.name || creative.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-12 h-12 text-gray-400" />
                          </div>
                        )}

                        {/* Selection checkbox */}
                        <div className={clsx(
                          'absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                          selectedCreatives.has(creative.id)
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'
                        )}>
                          {selectedCreatives.has(creative.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-2 bg-white">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {creative.name || creative.filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(creative.fileSize)}
                          {creative.width && creative.height && ` • ${creative.width}×${creative.height}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y">
                  {creatives.map((creative) => (
                    <div
                      key={creative.id}
                      onClick={() => toggleCreativeSelection(creative.id)}
                      className={clsx(
                        'flex items-center gap-4 p-3 cursor-pointer transition-colors',
                        selectedCreatives.has(creative.id) ? 'bg-primary-50' : 'hover:bg-gray-50'
                      )}
                    >
                      {/* Checkbox */}
                      <div className={clsx(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                        selectedCreatives.has(creative.id)
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-gray-300'
                      )}>
                        {selectedCreatives.has(creative.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>

                      {/* Thumbnail */}
                      <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        {creative.mimeType.startsWith('image/') ? (
                          <img
                            src={getCreativeUrl(creative)}
                            alt={creative.name || creative.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {creative.name || creative.filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(creative.fileSize)}
                          {creative.width && creative.height && ` • ${creative.width}×${creative.height}`}
                        </p>
                      </div>

                      {/* Folder */}
                      {creative.folder && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Folder className="w-3 h-3" />
                          {creative.folder.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
