export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('image');
    const bgColor = formData.get('bgColor') || 'white';

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    const removeFormData = new FormData();
    removeFormData.append('image_file', file);
    removeFormData.append('format', bgColor === 'white' ? 'png' : 'png');
    removeFormData.append('type', 'product');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.NEXT_PUBLIC_REMOVE_BG_API_KEY,
      },
      body: removeFormData,
    });

    if (!response.ok) {
      return Response.json({ error: 'Remove.bg API failed' }, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="processed.png"',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
