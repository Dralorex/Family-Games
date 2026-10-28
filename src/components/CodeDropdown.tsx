import { useEffect, useRef, useState } from 'react'

export function CodeDropdown({ code }: { code: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const el = document.createElement('textarea')
      el.value = code
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOpen(false)
    }, 700)
  }

  return (
    <div className="code-dropdown" ref={ref}>
      <button type="button" className="code-dropdown-trigger" onClick={() => setOpen((v) => !v)}>
        Code
      </button>
      {open ? (
        <div className="code-dropdown-pop" role="dialog" aria-label="Join code">
          <div className="code-display">{code}</div>
          <button type="button" className="btn primary" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
