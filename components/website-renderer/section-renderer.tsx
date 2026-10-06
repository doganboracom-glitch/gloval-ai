'use client'

import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { HeroSection } from '@/components/website-renderer/sections/hero-section'
import { SliderSection } from '@/components/website-renderer/sections/slider-section'
import { AboutSection } from '@/components/website-renderer/sections/about-section'
import { ServicesSection } from '@/components/website-renderer/sections/services-section'
import { FeaturesSection } from '@/components/website-renderer/sections/features-section'
import { StatsSection } from '@/components/website-renderer/sections/stats-section'
import { PricingSection } from '@/components/website-renderer/sections/pricing-section'
import { TestimonialsSection } from '@/components/website-renderer/sections/testimonials-section'
import { GallerySection } from '@/components/website-renderer/sections/gallery-section'
import { PortfolioSection } from '@/components/website-renderer/sections/portfolio-section'
import { ProductsSection } from '@/components/website-renderer/sections/products-section'
import { CategoriesSection } from '@/components/website-renderer/sections/categories-section'
import { ProcessSection } from '@/components/website-renderer/sections/process-section'
import { TeamSection } from '@/components/website-renderer/sections/team-section'
import { FaqSection } from '@/components/website-renderer/sections/faq-section'
import { ContactSection } from '@/components/website-renderer/sections/contact-section'
import { CtaSection } from '@/components/website-renderer/sections/cta-section'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'

/**
 * Dispatches a single schema section to its matching visual component based on
 * `section.type`. The discriminated union makes each branch fully type-safe,
 * and the `default` guarantees an unknown type can never crash the renderer.
 */
export function SectionRenderer({
  section,
  meta,
  showBranding = true,
}: {
  section: Section
  meta: WebsiteSchema['meta']
  /** Forwarded to the footer, which hosts the platform credit. */
  showBranding?: boolean
}) {
  switch (section.type) {
    case 'hero':
      return <HeroSection data={section} />
    case 'slider':
      return <SliderSection data={section} />
    case 'about':
      return <AboutSection data={section} />
    case 'services':
      return <ServicesSection data={section} lang={meta.language} />
    case 'features':
      return <FeaturesSection data={section} />
    case 'stats':
      return <StatsSection data={section} />
    case 'pricing':
      return (
        <PricingSection
          data={section}
          chooseLabel={meta.language === 'tr' ? 'Seç' : 'Choose'}
        />
      )
    case 'testimonials':
      return <TestimonialsSection data={section} />
    case 'gallery':
      return <GallerySection data={section} />
    case 'portfolio':
      return <PortfolioSection data={section} lang={meta.language} />
    case 'products':
      return <ProductsSection data={section} />
    case 'categories':
      return <CategoriesSection data={section} />
    case 'process':
      return <ProcessSection data={section} />
    case 'team':
      return <TeamSection data={section} lang={meta.language} />
    case 'faq':
      return <FaqSection data={section} />
    case 'contact':
      return (
        <ContactSection
          data={section}
          submitLabel={meta.language === 'tr' ? 'Gönder' : 'Send'}
        />
      )
    case 'cta':
      return <CtaSection data={section} />
    case 'footer':
      return (
        <WebsiteFooter
          data={section}
          logoText={meta.name}
          lang={meta.language}
          showBranding={showBranding}
        />
      )
    default:
      return null
  }
}
