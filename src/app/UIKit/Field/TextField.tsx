import React from 'react'
import { FIELD_CLASS, fieldStyle, type FieldSize } from './fieldStyle'

// The app's text input, textarea and select — every typed field goes through
// one of these (or NumberField for numbers), so they share a look, a radius
// (--radius-field) and the focus/disabled states. Everything a native element
// takes passes straight through; `style` layers on top of the shared look for
// layout (flex, width), not for restyling the field.

type Sized = { size?: FieldSize }

export type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & Sized

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { size = 'md', className, style, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(FIELD_CLASS, className)} style={{ ...fieldStyle(size), ...style }} {...rest} />
})

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & Sized

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { size = 'md', className, style, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cx(FIELD_CLASS, className)}
      style={{ ...fieldStyle(size), resize: 'vertical', lineHeight: 1.5, ...style }}
      {...rest}
    />
  )
})

export type SelectFieldProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & Sized

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { size = 'md', className, style, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(FIELD_CLASS, className)} style={{ ...fieldStyle(size), cursor: 'pointer', ...style }} {...rest}>
      {children}
    </select>
  )
})

/** The small caps label above a field. */
export function FieldLabel({ children, style, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em', ...style }}>
      {children}
    </span>
  )
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ')
}
