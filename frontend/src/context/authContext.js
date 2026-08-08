/**
 * context/authContext.js -- the context object and the hook to read it.
 *
 * WHY IS THIS SPLIT FROM AuthProvider.jsx?
 * Because of Fast Refresh -- the feature that updates a component in
 * the browser when you save, without reloading the page or losing
 * state. It works by re-running a module and swapping the component,
 * and it can only do that safely if the file exports COMPONENTS AND
 * NOTHING ELSE.
 *
 * Put AuthProvider (a component) and useAuth (a plain function) in
 * one file and Fast Refresh gives up on it, falling back to a full
 * page reload on every save. In an auth file that is genuinely
 * annoying: the reload logs you out of the form you were testing.
 *
 * So: this file holds the non-component exports, AuthProvider.jsx
 * holds the component. Both are tiny, and editing either one behaves
 * properly.
 *
 * WHAT IS A CONTEXT, IN ONE PARAGRAPH?
 * Normally data flows down through props: App gives it to Navbar,
 * Navbar gives it to Button. When something is needed by components
 * scattered all over the tree -- as the logged-in user is -- that
 * becomes "prop drilling": passing `user` through five components
 * that do not care about it, purely to reach the sixth. A context
 * lets a provider put a value into the tree once, and any descendant
 * read it directly, however deep.
 */

import { createContext, useContext } from 'react'

/**
 * The default value is only used when a component calls useAuth()
 * with no AuthProvider above it. We pass null so the hook below can
 * detect exactly that mistake and say something useful.
 */
export const AuthContext = createContext(null)

/**
 * The hook every component uses: `const { user, logout } = useAuth()`.
 *
 * WHY WRAP useContext AT ALL?
 * For the error. Without this check, forgetting the provider gives
 * you `null`, and the failure surfaces later as
 *
 *     Cannot destructure property 'user' of 'null'
 *
 * pointing at whichever component happened to read it first -- not at
 * the missing provider, which is the actual bug. Throwing here names
 * the real problem at the real moment.
 */
export function useAuth() {
  const context = useContext(AuthContext)

  if (context === null) {
    throw new Error('useAuth() must be used inside <AuthProvider>')
  }

  return context
}
