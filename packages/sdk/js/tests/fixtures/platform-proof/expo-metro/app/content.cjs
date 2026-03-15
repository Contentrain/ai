module.exports.run = async function run() {
  const client = await require('#contentrain').init()
  return {
    postTitle: client.query('blog-post').locale('en').first().title,
    articleCount: client.document('blog-article').locale('en').all().length,
  }
}
