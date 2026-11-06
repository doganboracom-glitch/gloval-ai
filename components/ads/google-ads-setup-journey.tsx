'use client'

import { CircleCheck, CircleDot, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type SetupStage = 'no-connection' | 'connected' | 'draft' | 'approved' | 'published'

const stepsTr = [
  { title: 'חשבון Google Ads', description: 'צור חשבון Google Ads אם עדיין אין לך.' },
  { title: 'חיבור חשבון', description: 'חבר חשבון לקוח פעיל; חשבון מנהל (MCC) אינו נתמך.' },
  { title: 'תכנון וטיוטה', description: 'בדוק את כתובת האתר, התקציב, המיקוד והמודעה לפני שמירת הטיוטה.' },
  { title: 'אישור ופרסום', description: 'אשר תנאים, אמת מול Google בפרסום בדיקה, ואז פרסם כשהקמפיין מושהה.' },
] as const
const stepsEn = [
  { title: 'Google Ads account', description: 'Create a Google Ads account if you do not have one yet.' },
  { title: 'Connect account', description: 'Connect an active customer account; manager accounts (MCC) are not supported.' },
  { title: 'Plan and draft', description: 'Review the landing page, budget, targeting, and ad before saving a draft.' },
  { title: 'Approve and publish', description: 'Accept terms, validate with Google, then publish the campaign paused.' },
] as const

const stageProgress: Record<SetupStage, number> = {
  'no-connection': 0,
  connected: 1,
  draft: 2,
  approved: 3,
  published: 4,
}

export function GoogleAdsSetupJourney({
  stage,
  onStartPlan,
}: {
  stage: SetupStage
  onStartPlan: () => void
}) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const steps = isTr ? stepsTr : stepsEn
  const progress = stageProgress[stage]

  return (
    <Card>
      <CardHeader>
        <CardTitle>מתחילים עם Google Ads</CardTitle>
        <CardDescription>מסלול קצר מחשבון מחובר ועד קמפיין מושהה ומאומת.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div
          role="progressbar"
          aria-label="התקדמות בהקמת Google Ads"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={progress}
          className="flex h-2 overflow-hidden rounded-full bg-muted"
        >
          <span className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress * 25}%` }} />
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const complete = index < progress
            const current = index === progress && progress < steps.length
            const Icon = complete ? CircleCheck : CircleDot
            return (
              <li key={step.title} className="flex items-start gap-3">
                <Icon className={complete || current ? 'mt-0.5 size-5 shrink-0 text-brand' : 'mt-0.5 size-5 shrink-0 text-muted-foreground'} aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="https://ads.google.com/home/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            לפתיחת חשבון Google Ads
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <Button type="button" variant="outline" onClick={onStartPlan} disabled={progress === 0}>
            יצירת תוכנית קמפיין
          </Button>
        </div>
        <Alert>
          <AlertDescription className="leading-relaxed">
            תקציב הפרסום נגבה ישירות על ידי Google. GLOVAL אינו מחזיק בכספי הפרסום; רק לאחר פרסום מוצלח ינוכו 15 קרדיטים של GLOVAL עבור ניהול ו-AI.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
