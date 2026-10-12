import { useGetArtistAlbums } from '@/app/hooks/use-album'

type A = ReturnType<typeof useGetArtistAlbums>
type D = A['data']
declare const x: D
export const y: number = x
