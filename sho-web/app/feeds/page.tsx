import { FeedsClient } from './FeedsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Feeds - Sho',
  description: 'Discover content in an immersive feed',
}

export default function FeedsPage() {
  return <FeedsClient />
}
