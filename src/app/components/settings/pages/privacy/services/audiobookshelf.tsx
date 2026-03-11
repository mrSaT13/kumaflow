export function Audiobookshelf() {
  return (
    <div className="flex items-center justify-between py-4 border-t border-border">
      <div className="space-y-1">
        <div className="font-medium">📚 Audiobookshelf</div>
        <div className="text-sm text-muted-foreground">
          Интеграция с сервером аудиокниг
        </div>
      </div>
      <a
        href="#/settings/audiobookshelf"
        className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted transition-colors"
      >
        Настроить
      </a>
    </div>
  )
}
