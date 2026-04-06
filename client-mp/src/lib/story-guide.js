export function stripInlineMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

export function formatWorldMd(worldMd) {
  if (!worldMd || !worldMd.trim()) {
    return []
  }

  const blocks = []
  const paragraphBuffer = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return
    }

    blocks.push({
      type: 'paragraph',
      content: stripInlineMarkdown(paragraphBuffer.join(' ')),
    })
    paragraphBuffer.length = 0
  }

  worldMd.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      return
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      blocks.push({
        type: headingMatch[1].length === 1 ? 'title' : 'heading',
        content: stripInlineMarkdown(headingMatch[2]),
      })
      return
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      blocks.push({
        type: 'item',
        content: stripInlineMarkdown(listMatch[1]).replace(/\s*[—-]\s*/g, '：'),
      })
      return
    }

    paragraphBuffer.push(line)
  })

  flushParagraph()
  return blocks.filter((block) => block.content)
}
