import { useState } from 'react'
import type { DragEvent } from 'react'

/**
 * Documents dragged onto a 똑딱업무 page (똑딱정리, 문서 변환, 똑딱서명) are the page's: the
 * drop is claimed here, so the app-wide drop opener (electron-utils drop-open) leaves it and
 * the files do not open as editor tabs. The files come back as paths (pathForFile: the file
 * on the desktop, the session's upload on the web edition); `over` is true while files hover.
 */
export function useFileDrop(onPaths: (paths: string[]) => void): {
  over: boolean
  handlers: {
    onDragOver: (e: DragEvent<HTMLElement>) => void
    onDragLeave: (e: DragEvent<HTMLElement>) => void
    onDrop: (e: DragEvent<HTMLElement>) => void
  }
} {
  const [over, setOver] = useState(false)
  const hasFiles = (e: DragEvent<HTMLElement>) => e.dataTransfer.types.includes('Files')
  return {
    over,
    handlers: {
      onDragOver: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!over) setOver(true)
      },
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setOver(false)
      },
      onDrop: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(false)
        onPaths(
          Array.from(e.dataTransfer.files)
            .map((f) => window.aiOffice.pathForFile(f))
            .filter(Boolean),
        )
      },
    },
  }
}
