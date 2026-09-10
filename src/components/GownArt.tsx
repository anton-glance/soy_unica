/**
 * Silueta de vestido para los artículos sin foto. Es la misma que dibuja el
 * prototipo (docs/prototype.html, función `art`): mismos tintes, mismo trazo,
 * misma proporción 3/4.
 */
const TINTS: [string, string][] = [
  ['#F2EBE1', '#E3D8C9'],
  ['#EFE8E6', '#DFD2CE'],
  ['#EDEAE1', '#DBD6C7'],
  ['#F1E9EA', '#E0D2D4'],
  ['#EAEBE5', '#D6D9CE'],
]

export function GownArt({ seed, className = 'art' }: { seed: number; className?: string }) {
  const [bg, fg] = TINTS[Math.abs(seed) % TINTS.length] as [string, string]
  return (
    <svg className={className} viewBox="0 0 300 400" role="img" aria-label="Foto del vestido">
      <rect width="300" height="400" fill={bg} />
      <path
        d="M150 44c14 0 26 8 26 8l-14 46c8 40 46 92 62 246H76c16-154 54-206 62-246l-14-46s12-8 26-8z"
        fill={fg}
      />
      <path d="M150 44v300" stroke={bg} strokeWidth="2" fill="none" />
    </svg>
  )
}
