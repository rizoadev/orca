/**
 * Pi chat icon for the session header more-actions sheet. A terminal glyph
 * distinguishes Pi Chat from the other session actions.
 */
import { SquareTerminal } from 'lucide-react-native'

type IconProps = {
  size?: number
  color?: string
  strokeWidth?: number
}

export function MobilePiChatIcon({ size = 16, color = '#888888', strokeWidth = 2.1 }: IconProps) {
  return <SquareTerminal size={size} color={color} strokeWidth={strokeWidth} />
}

export type PiChatIconComponent = (props: IconProps) => React.JSX.Element
