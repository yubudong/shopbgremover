export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === 'shopbgremover.com') {
      return Response.redirect(`https://www.shopbgremover.com${url.pathname}${url.search}`, 301);
    }
    return new Response('Not found', { status: 404 });
  }
}
