import type { Project } from '@captionforge/project-format'

/** Accent colors given to speakers that have no color assigned yet, in order of appearance. */
export const SPEAKER_PALETTE = ['#00E676', '#B388FF', '#40C4FF', '#FFD60A', '#FF6E9C', '#FF9E40']

type SpeakerSource = Pick<Project, 'captionTracks' | 'activeCaptionTrackId'> & Partial<Pick<Project, 'speakers'>>

/** Speakers in the active caption track, in order of first appearance. */
export function speakersInTrack(project: SpeakerSource): string[] {
  const track = project.captionTracks.find((t) => t.id === project.activeCaptionTrackId) ?? project.captionTracks[0]
  const names: string[] = []
  for (const cue of track?.cues ?? []) {
    const name = cue.speaker?.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** The color for a speaker: user-assigned, otherwise a stable palette color. */
export function speakerColor(project: SpeakerSource, name: string): string {
  const assigned = project.speakers?.find((s) => s.name === name)?.color
  if (assigned) return assigned
  const index = speakersInTrack(project).indexOf(name)
  return SPEAKER_PALETTE[(index < 0 ? 0 : index) % SPEAKER_PALETTE.length]
}
