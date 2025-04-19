const extractLinksFromMessage = message => {
  const links = []
  message.blocks.forEach(block => {
    if (block.type === 'rich_text') {
      block.elements.forEach(element => {
        if (element.type === 'rich_text_section') {
          element.elements.forEach(el => {
            if (el.type === 'link') {
              links.push(el.url)
            }
          })
        }
      })
    }
  })
  return links
}

export default function summarize(app, openai) {
  app.shortcut('summarize', async ({ shortcut, ack, client }) => {
    await ack()

    await handleFiles(shortcut, client, openai)
    await handleLinks(shortcut, openai, client)
  })
}

async function handleLinks(shortcut, openai, client) {
  const links = extractLinksFromMessage(shortcut.message)

  for (const link of links) {
    const response = await openai.responses.create({
      model: 'gpt-4.1',
      tools: [{ type: 'web_search_preview' }],
      input: `Summarize the content of the following link: ${link}. If the page is not accessible, provide only a short error message.`
    })

    await client.chat.postEphemeral({
      channel: shortcut.channel.id,
      user: shortcut.user.id,
      thread_ts: shortcut.message.ts,
      text: `Here is the summary of the <${link}|link> you requested: \n\n${response.output_text}`
    })
  }
}

async function handleFiles(shortcut, client, openai) {
  for (const file of shortcut.message.files) {
    const fileInfo = await client.files.info({ file: file.id })

    if (!fileInfo.ok) {
      console.error('Error fetching file info:', fileInfo.error)
      continue
    }

    const fileContentResponse = await fetch(fileInfo.file.url_private, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    })

    if (!fileContentResponse.ok) {
      console.error(
        'Error fetching file content:',
        fileContentResponse.statusText
      )
      continue
    }

    const fileContent = await fileContentResponse.arrayBuffer()
    const base64Content = Buffer.from(fileContent).toString('base64')

    const response = await openai.responses.create({
      model: 'gpt-4.1',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: fileInfo.file.name,
              file_data: `data:${fileInfo.file.mimetype};base64,${base64Content}`
            },
            {
              type: 'input_text',
              text: 'Summarize the content of this file. If the file is not accessible, provide only a short error message. The output should be formatted for Slack.'
            }
          ]
        }
      ]
    })

    await client.chat.postEphemeral({
      channel: shortcut.channel.id,
      user: shortcut.user.id,
      thread_ts: shortcut.message.ts,
      text: response.output_text
    })
  }
}
