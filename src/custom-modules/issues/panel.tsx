import React from 'react'
import { ListTodo } from 'lucide-react'

export default function IssuesPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ListTodo size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium">Issues</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center text-sm text-muted-foreground">
          Issues panel sedang dalam tahap porting.
        </p>
      </div>
    </div>
  )
}
