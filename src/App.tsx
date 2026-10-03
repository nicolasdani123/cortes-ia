import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { ConfigPage } from '@/pages/ConfigPage'
import { HomePage } from '@/pages/HomePage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ProjectPage } from '@/pages/ProjectPage'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/novo', element: <NewProjectPage /> },
      { path: '/projetos/:id', element: <ProjectPage /> },
      { path: '/config', element: <ConfigPage /> },
      {
        path: '*',
        element: <PlaceholderPage titulo="Página não encontrada" descricao="Esse endereço não existe." />,
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
