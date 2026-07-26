import { promises as fs } from 'fs'
import { extname } from 'path'
import NodeID3 from 'node-id3'

export interface FileTagMetadata {
  title?: string
  artist?: string
  album?: string
  genre?: string
  year?: number
  trackNumber?: number
}

export interface WriteTagResult {
  success: boolean
  error?: string
}

async function getMusicMetadata() {
  return import('music-metadata')
}

export async function readFileTags(filePath: string): Promise<FileTagMetadata | null> {
  try {
    const metadataLib = await getMusicMetadata()
    const metadata = await metadataLib.parseFile(filePath)

    return {
      title: metadata.common.title,
      artist: metadata.common.artist,
      album: metadata.common.album,
      genre: metadata.common.genre?.[0],
      year: metadata.common.year,
      trackNumber: metadata.common.track?.no,
    }
  } catch (error: any) {
    console.error('[TagWriter] Read error:', filePath, error.message)
    return null
  }
}

export async function isFileAccessible(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function resolveFilePath(serverPath: string, pathPrefix?: string): string {
  if (!pathPrefix) return serverPath

  const separatorIndex = pathPrefix.indexOf('->')
  if (separatorIndex === -1) return serverPath

  const from = pathPrefix.slice(0, separatorIndex).trim()
  const to = pathPrefix.slice(separatorIndex + 2).trim()

  if (!from || !to) return serverPath
  if (!serverPath.startsWith(from)) return serverPath

  return to + serverPath.slice(from.length)
}

export async function writeFileTags(
  filePath: string,
  tags: Partial<FileTagMetadata>,
): Promise<WriteTagResult> {
  const ext = extname(filePath).toLowerCase()

  if (ext === '.mp3') {
    return writeMp3Tags(filePath, tags)
  }

  if (ext === '.flac') {
    return writeFlacTags(filePath, tags)
  }

  return {
    success: false,
    error: `Формат ${ext || 'неизвестный'} пока не поддерживается для записи`,
  }
}

async function writeMp3Tags(
  filePath: string,
  tags: Partial<FileTagMetadata>,
): Promise<WriteTagResult> {
  try {
    const existing = NodeID3.read(filePath) || {}
    const updated = { ...existing } as NodeID3.Tags

    if (tags.title !== undefined) updated.title = tags.title
    if (tags.artist !== undefined) updated.artist = tags.artist
    if (tags.album !== undefined) updated.album = tags.album
    if (tags.genre !== undefined) updated.genre = tags.genre
    if (tags.year !== undefined) updated.year = String(tags.year)
    if (tags.trackNumber !== undefined) updated.trackNumber = String(tags.trackNumber)

    const success = NodeID3.write(updated, filePath)

    if (!success) {
      return { success: false, error: 'node-id3 не смог записать теги' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function writeFlacTags(
  filePath: string,
  tags: Partial<FileTagMetadata>,
): Promise<WriteTagResult> {
  // FLAC запись через metaflac (если установлен в системе)
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    const args: string[] = []

    if (tags.genre !== undefined) args.push(`--set-tag=GENRE=${tags.genre}`)
    if (tags.title !== undefined) args.push(`--set-tag=TITLE=${tags.title}`)
    if (tags.artist !== undefined) args.push(`--set-tag=ARTIST=${tags.artist}`)
    if (tags.album !== undefined) args.push(`--set-tag=ALBUM=${tags.album}`)
    if (tags.year !== undefined) args.push(`--set-tag=DATE=${tags.year}`)
    if (tags.trackNumber !== undefined) args.push(`--set-tag=TRACKNUMBER=${tags.trackNumber}`)

    if (args.length === 0) {
      return { success: false, error: 'Нет тегов для записи' }
    }

    args.push(filePath)
    await execFileAsync('metaflac', args)

    return { success: true }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        success: false,
        error: 'Для FLAC установите metaflac (FLAC tools) или исправьте тег вручную',
      }
    }

    return { success: false, error: error.message }
  }
}
