import ink from '../assets/brand/logo-ink.png'
import cream from '../assets/brand/logo-cream.png'

/**
 * El logo de la tienda sobre fondo transparente, en las dos variantes de la
 * paleta: tinta para superficies claras, crema para las oscuras. Sustituye al
 * texto «Soy Única» en todas partes.
 */
export function Brandmark({ tone = 'ink', size = 'md' }: { tone?: 'ink' | 'cream'; size?: 'md' | 'lg' }) {
  return (
    <img
      className={`brandmark${size === 'lg' ? ' brandmark--lg' : ''}`}
      src={tone === 'cream' ? cream : ink}
      alt="Soy Única Novias"
    />
  )
}
