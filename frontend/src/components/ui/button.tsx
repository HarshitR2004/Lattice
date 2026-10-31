import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ComponentProps } from 'react'
// shadcn/ui composition pattern, styled for Lattice.
const variants = cva('ui-button', { variants: { variant: { ghost: 'ui-button-ghost', outline: 'ui-button-outline' } }, defaultVariants: { variant: 'ghost' } })
export function Button({ asChild = false, variant, className, ...props }: ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={twMerge(clsx(variants({ variant }), className))} {...props} />
}
