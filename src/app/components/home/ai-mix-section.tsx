import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack } from '/@/shared/components/stack/stack'
import { Text } from '/@/shared/components/text/text'
import { Tabs } from '/@/renderer/components/tabs/tabs'

import styles from './ai-mix-section.module.css'

interface AIMixSectionProps {
  onMoodSelect?: (mood: string) => void
}

interface MoodCategory {
  id: string
  label: string
  color: string
  icon: string
}

const MOOD_CATEGORIES: Record<string, MoodCategory[]> = {
  top: [
    { id: 'trending', label: 'Популярное', color: '#ff6b6b', icon: '🔥' },
    { id: 'new', label: 'Новинки', color: '#4ecdc4', icon: '✨' },
    { id: 'classic', label: 'Классика', color: '#ffd93d', icon: '💎' },
    { id: 'viral', label: 'Вирусное', color: '#ff69b4', icon: '🚀' },
  ],
  genre: [
    { id: 'rock', label: 'Рок', color: '#e74c3c', icon: '🎸' },
    { id: 'electronic', label: 'Электроника', color: '#9b59b6', icon: '🎹' },
    { id: 'hiphop', label: 'Хип-хоп', color: '#f39c12', icon: '🎤' },
    { id: 'jazz', label: 'Джаз', color: '#3498db', icon: '🎺' },
    { id: 'classical', label: 'Классика', color: '#1abc9c', icon: '🎻' },
    { id: 'metal', label: 'Метал', color: '#2c3e50', icon: '🤘' },
  ],
  mood: [
    { id: 'happy', label: 'Весёлое', color: '#ffeaa7', icon: '😊' },
    { id: 'sad', label: 'Грустное', color: '#74b9ff', icon: '😢' },
    { id: 'energetic', label: 'Энергичное', color: '#ff7675', icon: '⚡' },
    { id: 'calm', label: 'Спокойное', color: '#a29bfe', icon: '🌙' },
    { id: 'romantic', label: 'Романтичное', color: '#fd79a8', icon: '💕' },
    { id: 'focused', label: 'Для фокуса', color: '#55efc4', icon: '🎯' },
  ],
  activity: [
    { id: 'workout', label: 'Тренировка', color: '#fd79a8', icon: '💪' },
    { id: 'work', label: 'Работа', color: '#74b9ff', icon: '💼' },
    { id: 'sleep', label: 'Сон', color: '#6c5ce7', icon: '😴' },
    { id: 'party', label: 'Вечеринка', color: '#fdcb6e', icon: '🎉' },
    { id: 'travel', label: 'Путешествие', color: '#00b894', icon: '✈️' },
    { id: 'gaming', label: 'Игры', color: '#e17055', icon: '🎮' },
  ],
}

export const AIMixSection = ({ onMoodSelect }: AIMixSectionProps) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<string>('top')

  const handleTileClick = (moodId: string) => {
    onMoodSelect?.(moodId)
  }

  const tabs = [
    { id: 'top', label: 'Топ' },
    { id: 'genre', label: 'По жанру' },
    { id: 'mood', label: 'Под настроение' },
    { id: 'activity', label: 'Под занятие' },
  ]

  return (
    <Stack gap="lg" className="px-8 py-4">
      <Text size="xl" weight="bold">
        Свели в AI-сет
      </Text>

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="pills"
      >
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {tabs.map((tab) => (
          <Tabs.Panel key={tab.id} value={tab.id}>
            <div className={styles.tilesGrid}>
              {MOOD_CATEGORIES[tab.id]?.map((mood) => (
                <button
                  key={mood.id}
                  className={styles.tile}
                  onClick={() => handleTileClick(mood.id)}
                  style={{
                    background: mood.color,
                  }}
                  type="button"
                >
                  <Stack align="center" gap="sm" justify="center">
                    <span className={styles.icon}>{mood.icon}</span>
                    <Text
                      className={styles.label}
                      size="lg"
                      weight="bold"
                      style={{ color: 'white' }}
                    >
                      {mood.label}
                    </Text>
                  </Stack>
                </button>
              ))}
            </div>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  )
}
