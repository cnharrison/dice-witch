/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
			brand: {
				DEFAULT: 'hsl(var(--brand))',
				foreground: 'hsl(var(--brand-foreground))',
				hover: 'hsl(var(--brand-hover))'
			},
			discord: {
				DEFAULT: 'hsl(var(--discord))',
				foreground: 'hsl(var(--discord-foreground))',
				hover: 'hsl(var(--discord-hover))'
			},
			warning: {
				DEFAULT: 'hsl(var(--warning))',
				foreground: 'hsl(var(--warning-foreground))',
				border: 'hsl(var(--warning-border))'
			},
			info: {
				DEFAULT: 'hsl(var(--info))',
				foreground: 'hsl(var(--info-foreground))',
				border: 'hsl(var(--info-border))'
			},
			success: {
				DEFAULT: 'hsl(var(--success))',
				foreground: 'hsl(var(--success-foreground))',
				border: 'hsl(var(--success-border))'
			},
			marketing: {
				background: 'hsl(var(--marketing-background))',
				surface: 'hsl(var(--marketing-surface))',
				panel: 'hsl(var(--marketing-panel))',
				card: 'hsl(var(--marketing-card))',
				foreground: 'hsl(var(--marketing-foreground))',
				muted: 'hsl(var(--marketing-muted))',
				border: 'hsl(var(--marketing-border))',
				accent: 'hsl(var(--marketing-accent))',
				'accent-hover': 'hsl(var(--marketing-accent-hover))'
			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
			select: 'hsl(var(--select))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

