import './globals.css'

export const metadata = {
    title: 'GA4 Analytics Dashboard',
    description: 'Multi-client Google Analytics 4 dashboard with automated daily data sync',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
