export function Rating({ value }: { value: number }) {
  return <span>{'*'.repeat(Math.round(value))}</span>
}
