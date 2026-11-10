(() => {
  const form = document.getElementById('feedbackForm'); if (!form) return;
  const status = document.getElementById('feedbackStatus'), button = document.getElementById('feedbackSubmit');
  const pictureInput = document.getElementById('feedbackPictures'), preview = document.getElementById('feedbackPreview');
  let pictures = [], preparing = false, submitting = false, reference = crypto.randomUUID();
  function message(text, success = false) { status.textContent = text; status.classList.toggle('feedback-success', success); }
  form.elements.topic.addEventListener('change', () => {
    const other = document.getElementById('feedbackOtherWrap'); other.hidden = form.elements.topic.value !== 'Other';
    form.elements.otherTopic.required = !other.hidden;
  });
  pictureInput.addEventListener('change', async () => {
    pictures = []; preview.replaceChildren();
    const files = Array.from(pictureInput.files);
    if (files.length > 5) { pictureInput.value = ''; message('Please choose up to five pictures.'); return; }
    preparing = true; button.disabled = true; message('Preparing your pictures…');
    try {
      for (const file of files) {
        const picture = await Food101.picture(file); pictures.push(picture);
        const img = document.createElement('img'); img.src = `data:${picture.mime};base64,${picture.data}`; img.alt = 'Attachment preview'; preview.append(img);
      }
      message(files.length ? `${files.length} picture${files.length === 1 ? '' : 's'} ready to send.` : '');
    } catch (error) { pictures = []; preview.replaceChildren(); pictureInput.value = ''; message(error.message); }
    finally { preparing = false; button.disabled = false; }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (preparing || submitting) return;
    const f = form.elements;
    const value = { id: reference, type: f.feedbackType.value, customer: f.customer.value,
      topic: f.topic.value === 'Other' ? f.otherTopic.value.trim() : f.topic.value,
      message: f.message.value.trim(), phone: f.phone.value.trim(), pictures, website: f.website.value };
    if (!value.message) { message('Please tell us how we can help.'); f.message.focus(); return; }
    submitting = true; button.disabled = true; button.textContent = 'Sending your feedback…'; message('');
    try {
      await Food101.request('/api/feedback', { method: 'POST', body: JSON.stringify(value) });
      form.reset(); pictures = []; preview.replaceChildren(); document.getElementById('feedbackOtherWrap').hidden = true; f.otherTopic.required = false;
      message('Thank you! Your feedback has been received. The Food 101 team will review it.', true);
      reference = crypto.randomUUID();
    } catch (error) { message(error.message + ' Your details have been kept so you can retry.'); }
    finally { submitting = false; button.disabled = false; button.textContent = 'Send feedback →'; }
  });
})();
