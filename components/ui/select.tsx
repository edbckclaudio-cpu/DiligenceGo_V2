import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'

export const Select = SelectPrimitive.Root

export function SelectTrigger(props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger {...props} className={`inline-flex items-center justify-between w-full rounded border px-3 py-2 text-sm ${props.className ?? ''}`}>
      <SelectPrimitive.Value />
      <SelectPrimitive.Icon>
        <ChevronDown className="h-4 w-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export const SelectContent = (props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content {...props} className={`overflow-hidden bg-white rounded border shadow z-50 ${props.className ?? ''}`}>
      <SelectPrimitive.Viewport className="p-1" />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
)

export const SelectItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  (props, ref) => (
    <SelectPrimitive.Item ref={ref} {...props} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer data-[highlighted]:bg-neutral-100 ${props.className ?? ''}`}>
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText />
    </SelectPrimitive.Item>
  )
)
SelectItem.displayName = 'SelectItem'
