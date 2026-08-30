import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import AuthProvider from './app/AuthProvider'
import { ConfigProvider } from './app/ConfigProvider'
import './styles/base.css'

/* Provider order matters: ConfigProvider sits outermost because the theme and
   site name it supplies are needed by every screen including the auth forms,
   and it does not depend on a session. */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
)
