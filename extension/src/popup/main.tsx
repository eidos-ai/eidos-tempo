import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { Popup } from './Popup'
import { applyCachedTheme } from './theme'

applyCachedTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Popup markup is missing #root')

createRoot(root).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
