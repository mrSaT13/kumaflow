/**
 * Playlist Generation Queue - Очередь генерации плейлистов
 * 
 * Предотвращает перегрузку системы путём последовательной генерации
 * Максимум 1 плейлист генерируется одновременно
 */

interface QueueItem {
  id: string
  type: string
  genre?: string
  generator: () => Promise<any>
  resolve: (result: any) => void
  reject: (error: any) => void
  addedAt: number
}

class PlaylistGenerationQueue {
  private queue: QueueItem[] = []
  private isProcessing = false
  private readonly maxConcurrent = 1  // Только одна генерация одновременно

  /**
   * Добавить задачу в очередь
   */
  async add<T>(
    id: string,
    type: string,
    genre: string | undefined,
    generator: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        id,
        type,
        genre,
        generator: generator as () => Promise<any>,
        resolve,
        reject,
        addedAt: Date.now(),
      }

      console.log(`[Queue] Adding task: ${id} (${type})`)
      this.queue.push(item)
      
      // Запускаем обработку если не запущена
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  /**
   * Обработка очереди
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.queue.length > 0) {
      // Берём первую задачу
      const item = this.queue[0]
      
      console.log(`[Queue] Processing: ${item.id} (${item.type})`)
      console.log(`[Queue] Queue size: ${this.queue.length}`)

      try {
        // Генерируем плейлист
        const result = await item.generator()
        item.resolve(result)
        console.log(`[Queue] Completed: ${item.id}`)
      } catch (error) {
        console.error(`[Queue] Error processing ${item.id}:`, error)
        item.reject(error)
      } finally {
        // Удаляем задачу из очереди
        this.queue.shift()
        
        // Небольшая задержка между генерациями чтобы не нагружать систему
        if (this.queue.length > 0) {
          console.log('[Queue] Waiting 2 seconds before next task...')
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
    }

    this.isProcessing = false
    console.log('[Queue] All tasks completed')
  }

  /**
   * Получить статус очереди
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      currentTask: this.queue[0]?.id,
      queuedTasks: this.queue.map(item => ({
        id: item.id,
        type: item.type,
        genre: item.genre,
        waitingTime: Date.now() - item.addedAt,
      })),
    }
  }

  /**
   * Очистить очередь
   */
  clear() {
    const rejectedTasks = this.queue.map(item => ({
      id: item.id,
      type: item.type,
      genre: item.genre,
    }))
    
    this.queue = []
    this.isProcessing = false
    
    console.log('[Queue] Cleared. Rejected tasks:', rejectedTasks)
    
    // Отменяем все задачи
    rejectedTasks.forEach(task => {
      const item = this.queue.find(i => i.id === task.id)
      if (item) {
        item.reject(new Error('Task cancelled'))
      }
    })
  }

  /**
   * Удалить конкретную задачу из очереди
   */
  remove(taskId: string): boolean {
    const index = this.queue.findIndex(item => item.id === taskId)
    
    if (index !== -1) {
      const [removed] = this.queue.splice(index, 1)
      removed.reject(new Error('Task removed from queue'))
      console.log(`[Queue] Removed task: ${taskId}`)
      return true
    }
    
    return false
  }
}

// Экспортируем единственный экземпляр очереди
export const playlistGenerationQueue = new PlaylistGenerationQueue()

/**
 * Хук для использования очереди в React компонентах
 */
export function usePlaylistQueue() {
  const addToQueue = async <T,>(
    id: string,
    type: string,
    genre: string | undefined,
    generator: () => Promise<T>
  ): Promise<T> => {
    return playlistGenerationQueue.add(id, type, genre, generator)
  }

  const getStatus = () => playlistGenerationQueue.getStatus()
  const clearQueue = () => playlistGenerationQueue.clear()
  const removeFromQueue = (taskId: string) => playlistGenerationQueue.remove(taskId)

  return {
    addToQueue,
    getStatus,
    clearQueue,
    removeFromQueue,
  }
}
