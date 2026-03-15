module.exports.run = async function run() {
  const client = await require('#contentrain').init()
  return {
    heroTitle: client.singleton('hero').get().title,
    missingMessage: client.dictionary('error-messages').locale('en').get('not_found'),
  }
}
