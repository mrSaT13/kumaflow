/**
 * Посадить ленту на сид: артиста или трек.
 *
 * Зачем отдельный шаг: «В стиле: Reamonn» — это не обычная волна с
 * пилюлями, а лента с сидом. Яндекс в этом случае меняет подпись в ховере
 * и в фуллскрине и НЕ показывает пилюли настроения: «Работаю» и
 * «В стиле: Reamonn» вместе не читаются.
 *
 * Тут три записи, которые раньше расходились:
 *   * сид — его читает капсула на главной и кнопка сброса ×;
 *   * имя плейлиста — его показывает фуллскрин-панель;
 *   * контекст волны (my-wave-last) — по нему восстанавливается, что это
 *     волна, после перезапуска и после handoff.
 *
 * Обратное действие — clearWaveSeed(): обычный запуск волны обязан гасить
 * сид, иначе капсула продолжит врать, что играет «В стиле: …».
 */
import { usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import { waveSeedClear } from './brain-wave'
import {
  clearWaveSeed,
  saveWaveContext,
  saveWaveSeed,
  seedLabel,
} from './wave-identity'

/** Посадить очередь на сид. Возвращает подпись, которой помечен плейлист. */
export function applyWaveSeed(
  kind: 'artist' | 'track',
  label: string,
  songs: ISong[],
): string {
  const name = seedLabel({ kind, label })
  saveWaveSeed({ kind, label })
  usePlayerStore
    .getState()
    .actions.setSongList(songs, 0, false, undefined, name)
  saveWaveContext(
    (songs ?? []).map((s) => s.id),
    name,
    'brain',
  )
  return name
}

/**
 * Сорвать сид: лента возвращается в обычную волну с пилюлями.
 *
 * Гасим сид И на сервере: с 0.3.23 сохранённый сид — якорь волны, и
 * локальный сброс без DELETE /api/wave/seed оставлял бы стиль сида рулить
 * волной. Ошибка сети не критична: сервер протухнет сид через 12 ч.
 */
export function clearWaveSeedPlaylist(): void {
  clearWaveSeed()
  void waveSeedClear().catch(() => undefined)
}
