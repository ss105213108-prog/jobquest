/** Runs against the isolated fixture DOM; no form submission or application state. */
export function inspectResumeEditorReadability() {
  const issues = []
  const px = value => +value.replace('px', '')
  const query = selector => Array.from(document.querySelectorAll(selector))
  const font = (selector, expected, weight) => {
    for (const element of query(selector)) {
      const style = getComputedStyle(element)
      if (style.fontSize !== expected || weight && style.fontWeight !== weight) issues.push(`Typography: ${selector}`)
    }
  }
  font('.review-grid input,.review-grid textarea,.editable-tags input', '18px', '400')
  font('.review-grid label,.editable-tags>strong', '17px')
  font('.resume-review>p,.review-missing,.resume-error,.step-kicker', '16px')
  font('.review-group h2', '22px')
  font('.editable-tags>div button,.resume-review button', '17px')
  for (const element of query('input[placeholder],textarea[placeholder]')) {
    const style = getComputedStyle(element, '::placeholder')
    if (style.fontSize !== '16px' || style.color !== 'rgb(111, 75, 37)' || style.opacity !== '1') issues.push('Placeholder typography/contrast')
  }
  const card = document.querySelector('.resume-review').getBoundingClientRect()
  for (const element of query('.resume-review input,.resume-review textarea,.resume-review button')) {
    const rect = element.getBoundingClientRect()
    if (rect.left < card.left - 1 || rect.right > card.right + 1) issues.push('Control overflow')
  }
  for (const element of query('.review-grid input,.editable-tags input')) {
    const style = getComputedStyle(element)
    const space = element.clientHeight - px(style.paddingTop) - px(style.paddingBottom)
    if (space + 1 < px(style.lineHeight) || element.getBoundingClientRect().height < 51.5) issues.push('Input clipping/height')
  }
  for (const element of query('.review-grid textarea')) {
    const style = getComputedStyle(element)
    if (px(style.lineHeight) < 29 || element.getBoundingClientRect().height < 159.5) issues.push('Textarea spacing')
  }
  for (const label of query('.review-grid label')) {
    const text = label.querySelector('span').getBoundingClientRect()
    const control = label.querySelector('input,textarea').getBoundingClientRect()
    if (control.top - text.bottom < 7.5) issues.push('Label/control spacing')
  }
  const back = document.querySelector('.back-button').getBoundingClientRect()
  const kicker = document.querySelector('.step-kicker').getBoundingClientRect()
  if (back.bottom > kicker.top + .5) issues.push('Back/source copy overlap')
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('Horizontal overflow')
  return { viewport: [innerWidth, innerHeight], issues,
    inputFont: getComputedStyle(document.querySelector('.review-grid input')).fontSize,
    inputWeight: getComputedStyle(document.querySelector('.review-grid input')).fontWeight,
    textareaFont: getComputedStyle(document.querySelector('textarea')).fontSize }
}
