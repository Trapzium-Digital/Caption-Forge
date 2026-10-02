import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EditorPage } from '@/features/editor/EditorPage'
import { ProjectsPage } from '@/features/home/ProjectsPage'

/** Minimal hash router: #/ (projects) and #/project/<id> (editor). */
function useRoute(): [string | null, (projectId: string | null) => void] {
  const read = () => window.location.hash.match(/^#\/project\/([\w-]+)/)?.[1] ?? null
  const [projectId, setProjectId] = useState(read)
  useEffect(() => {
    const onHash = () => setProjectId(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = (id: string | null) => {
    window.location.hash = id ? `/project/${id}` : '/'
  }
  return [projectId, navigate]
}

export default function App() {
  const [projectId, navigate] = useRoute()
  return (
    <TooltipProvider delayDuration={400}>
      {projectId ? (
        <EditorPage key={projectId} projectId={projectId} onExit={() => navigate(null)} />
      ) : (
        <ProjectsPage onOpen={navigate} />
      )}
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  )
}
