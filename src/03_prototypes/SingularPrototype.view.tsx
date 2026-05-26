import { useEffect, useRef, useState } from 'react'
import { Frame } from '../02_components/01_atoms/Frame/Frame'
import { Text } from '../02_components/01_atoms/Text/Text'

const notifications = [
  {
    id: 'A01',
    title: '[DRONE SWARM SIGMA] NAVIGATION FAILURE',
    detail: 'Drift detected: +1.8km off vector',
    action: 'Recalibrate or abort mission',
    stamp: '13:35:02'
  },
  {
    id: 'A02',
    title: '[UNIT BRAVO-9] ENGAGED HOSTILE FORCE',
    detail: 'Armor level: 32%',
    action: 'Authorize reinforcement protocol',
    stamp: '13:34:21'
  },
  {
    id: 'A03',
    title: '[UNIT ALPHA-3] COMMS LOSS ON GRID E7',
    detail: 'Silent for 2m 18s',
    action: 'Route relay through JTIDS',
    stamp: '13:33:47'
  }
]

export default function SingularPrototypeView() {
  const [leftWidth, setLeftWidth] = useState(78)
  const [rightWidth, setRightWidth] = useState(360)

  const resizeRef = useRef<{
    side: 'left' | 'right' | null
    startX: number
    startWidth: number
  }>({
    side: null,
    startX: 0,
    startWidth: 0,
  })

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  const startResize = (side: 'left' | 'right', event: React.MouseEvent) => {
    event.preventDefault()
    resizeRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftWidth : rightWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const active = resizeRef.current
      if (!active.side) return

      const deltaX = event.clientX - active.startX

      if (active.side === 'left') {
        setLeftWidth(clamp(active.startWidth + deltaX, 64, 280))
      } else {
        setRightWidth(clamp(active.startWidth - deltaX, 280, 620))
      }
    }

    const stopResize = () => {
      if (!resizeRef.current.side) return
      resizeRef.current.side = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', stopResize)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  return (
    <Frame
      layout="grid"
      className="grid min-h-full bg-[var(--bg-dark)]"
      style={{ gridTemplateColumns: `${leftWidth}px 10px minmax(0, 1fr) 10px ${rightWidth}px` }}
    >
      <Frame layout="flex" direction="column" gap={22} padding={12} border={{ right: { width: '1px', color: 'var(--border-1)' } }} background="rgba(255,255,255,0.02)">
        <Frame layout="flex" align="center" justify="center" width={28} height={28} border="1px solid var(--border-1)" className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-0)]">
          SL
        </Frame>
        <Frame layout="flex" direction="column" gap={12}>
          {['GROUP-1', 'ML', 'GROUND_UNIT', 'FIXED_WING', 'GROUP-2', 'JTIDS'].map((label) => (
            <Text key={label} variant="xs" color="text-2" className="tracking-[0.13em]">
              {label}
            </Text>
          ))}
        </Frame>
      </Frame>

      <Frame
        as="button"
        onMouseDown={(event) => startResize('left', event)}
        className="h-full cursor-col-resize border-r border-[var(--border-1)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.08)]"
        aria-label="Resize left panel"
      />

      <Frame
        position="relative"
        clipContent
        border={{ right: { width: '1px', color: 'var(--border-1)' } }}
        background="linear-gradient(180deg, rgba(11, 11, 13, 1), rgba(8, 10, 14, 1))"
      >
        <Frame
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '78px 78px',
            opacity: 0.18
          }}
        />
        <Frame
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          style={{
            background:
              'radial-gradient(circle at 32% 18%, rgba(255,255,255,0.06), transparent 35%), radial-gradient(circle at 52% 70%, rgba(255,255,255,0.05), transparent 34%), radial-gradient(circle at 74% 38%, rgba(255,255,255,0.05), transparent 30%)'
          }}
        />

        {[
          { top: '12%', left: '30%', size: 112, active: false },
          { top: '24%', left: '23%', size: 74, active: true },
          { top: '56%', left: '55%', size: 74, active: true },
          { top: '78%', left: '33%', size: 74, active: false }
        ].map((node, index) => (
          <Frame
            key={index}
            position="absolute"
            top={node.top}
            left={node.left}
            width={node.size}
            height={node.size}
            border="1px solid rgba(255,255,255,0.42)"
            borderRadius="999px"
            className="before:absolute before:inset-[-11px] before:rounded-[inherit] before:border before:border-[rgba(255,255,255,0.16)] before:content-['']"
            style={{ boxShadow: node.active ? '0 0 0 1px rgba(255,255,255,0.22)' : 'none' }}
          />
        ))}

        <Frame position="absolute" top="44%" left="56%" padding={{ x: 14, y: 6 }} border="1px solid var(--border-1)" background="rgba(7,10,15,0.8)">
          <Text variant="xs" className="tracking-[0.18em] text-[var(--text-0)]">
            NOTIFICATIONS
          </Text>
        </Frame>

        <Frame as="button" position="absolute" top="58%" left="44%" padding={{ x: 14, y: 6 }} border="1px solid rgba(255,255,255,0.35)" background="rgba(255,255,255,0.04)" className="cursor-pointer uppercase tracking-[0.15em] text-[10px] text-[var(--text-0)]">
          ISOLATE
        </Frame>
      </Frame>

      <Frame
        as="button"
        onMouseDown={(event) => startResize('right', event)}
        className="h-full cursor-col-resize border-r border-[var(--border-1)] bg-[rgba(255,255,255,0.03)] transition-colors hover:bg-[rgba(255,255,255,0.08)]"
        aria-label="Resize right panel"
      />

      <Frame layout="flex" direction="column" gap={12} padding={16} background="linear-gradient(180deg, rgba(12, 12, 14, 0.98), rgba(9, 9, 11, 0.96))">
        <Frame padding={12} border="1px solid var(--border-1)" background="rgba(255,255,255,0.02)">
          <Text variant="h2" weight="black" className="leading-none tracking-[0.03em]">
            ML-2255
          </Text>
          <Text variant="xs" color="text-2" className="mt-2 tracking-[0.16em]">
            Manual Control
          </Text>
        </Frame>

        <Frame padding={12} border="1px solid var(--border-1)" background="rgba(255,255,255,0.02)" className="min-h-[180px]">
          <Frame className="h-[150px] w-full border border-[rgba(255,255,255,0.12)]" style={{ background: 'radial-gradient(circle at 28% 34%, rgba(255,255,255,0.72) 0 2px, transparent 3px), radial-gradient(circle at 60% 58%, rgba(255,255,255,0.72) 0 2px, transparent 3px), linear-gradient(to top, transparent 0 65%, rgba(255,255,255,0.42) 65% 66%, transparent 66% 100%)' }} />
        </Frame>

        <Frame padding={12} border="1px solid var(--border-1)" background="rgba(255,255,255,0.02)" layout="flex" direction="column" gap={10}>
          <Text variant="h6" weight="bold" className="uppercase tracking-[0.15em]">
            Executive Summary
          </Text>
          <Frame as="ul" layout="flex" direction="column" gap={10} className="list-none p-0 m-0">
            {notifications.map((item) => (
              <Frame as="li" key={item.id} layout="flex" direction="column" gap={2} padding={{ top: 8 }} border={{ top: { width: '1px', color: 'rgba(255,255,255,0.08)' } }}>
                <Text variant="xs" className="tracking-[0.08em] text-[var(--text-0)]">
                  {item.title}
                </Text>
                <Text variant="small" color="text-2">
                  {item.detail}
                </Text>
                <Text variant="small" color="text-2">
                  Recommended Action: {item.action}
                </Text>
                <Text variant="xs" color="text-3" className="tracking-[0.1em]">
                  {item.stamp}
                </Text>
              </Frame>
            ))}
          </Frame>
        </Frame>

        <Frame padding={12} border="1px solid var(--border-1)" background="rgba(255,255,255,0.02)" layout="flex" direction="column" gap={10}>
          <Text variant="h6" weight="bold" className="uppercase tracking-[0.15em]">
            AI Recommendation
          </Text>
          <Text variant="small" color="text-2">
            Focus command attention on E7 sector instability. Probability of escalation within next 15 minutes: 68%.
          </Text>
          <Frame layout="flex" direction="column" gap={8}>
            <Text variant="xs" color="text-2" className="tracking-[0.16em]">
              NEXT UPDATE IN: 00:02:00
            </Text>
            <Frame height={7} border="1px solid var(--border-1)" background="rgba(255,255,255,0.04)">
              <Frame width="42%" height="100%" background="linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.95))" />
            </Frame>
          </Frame>
        </Frame>

        <Text variant="xs" color="text-2" className="mt-auto border-t border-[var(--border-1)] pt-3 tracking-[0.08em]">
          find an asset...
        </Text>
      </Frame>
    </Frame>
  )
}
