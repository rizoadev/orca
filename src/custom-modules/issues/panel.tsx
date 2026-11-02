import React from 'react'
import { ListTodo, Plus, Search } from 'lucide-react'

export default function IssuesPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ListTodo size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium">Issues</span>
        <div className="ml-auto flex gap-1">
          <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <Search size={14} />
          </button>
          <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center text-sm text-muted-foreground">
          Issues panel – connect a repo with issue tracking to see issues here.
        </p>
      </div>
    </div>
  )
}
