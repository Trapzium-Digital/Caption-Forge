import { useEffect } from 'react'
import { useEditor } from '@/store/editor'
import { playback } from '@/store/playback'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

/** Focused controls keep their own keys (Space on buttons, arrows in sliders and radio groups). */
function isControl(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(
    el?.closest('button, a, [role=slider], [role=radio], [role=radiogroup], [role=tab], [role=switch], [role=menuitem], [role=option], [role=combobox]'),
  )
}

export function useShortcuts(save: (reason: 'manual') => Promise<void>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const state = useEditor.getState()

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save('manual').catch(() => undefined)
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (isTyping(e.target)) return
        e.preventDefault()
        state.redo()
        return
      }
      if (mod || e.altKey || isTyping(e.target) || isControl(e.target)) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          playback.toggle()
          break
        case 'ArrowLeft':
          e.preventDefault()
          playback.stepFrames(e.shiftKey ? -10 : -1)
          break
        case 'ArrowRight':
          e.preventDefault()
          playback.stepFrames(e.shiftKey ? 10 : 1)
          break
        case 'Home':
          playback.seek(0)
          break
        case 's':
        case 'S':
          state.splitSelectedAt(state.currentTimeMs)
          break
        case 'm':
        case 'M':
          state.mergeSelectedWithNext()
          break
        case 'Backspace':
        case 'Delete':
          if (state.selectedCueId) {
            e.preventDefault()
            state.deleteCue(state.selectedCueId)
          }
          break
        case 'Escape':
          state.selectCue(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])
}
