export const DOM = {
  content: document.getElementById('content') as HTMLElement,
  breadcrumb: document.getElementById('breadcrumb') as HTMLElement,
  loading: document.getElementById('loading-spinner') as HTMLElement,
  previewSec: document.getElementById('preview') as HTMLElement,
  previewContent: document.getElementById('preview-content') as HTMLElement,
  modal: document.getElementById('preview-modal') as HTMLElement,
  modalTitle: document.getElementById('modal-title') as HTMLElement,
  modalBody: document.getElementById('modal-body') as HTMLElement,
  modalClose: document.getElementById('modal-close') as HTMLElement,
  searchInput: document.getElementById('site-search') as HTMLInputElement,
  refreshBtn: document.getElementById(
    'btn-refresh-external',
  ) as HTMLButtonElement,
};

export function openModal(title: string, content: HTMLElement | string): void {
  DOM.modalTitle.textContent = title;
  DOM.modalBody.innerHTML = '';
  DOM.modalBody.classList.remove('modal-body-code');

  if (typeof content === 'string') {
    DOM.modalBody.innerHTML = content;
  } else {
    if (content.classList.contains('code-preview')) {
      DOM.modalBody.classList.add('modal-body-code');
    }

    DOM.modalBody.appendChild(content);
  }

  DOM.modal.style.display = 'flex';
  setTimeout(() => DOM.modal.classList.add('show'), 10);
  document.body.style.overflow = 'hidden';
}

export function closeModal(): void {
  DOM.modal.classList.remove('show');
  setTimeout(() => {
    DOM.modal.style.display = 'none';
    document.body.style.overflow = '';
    DOM.modalBody.innerHTML = '';
    DOM.modalBody.classList.remove('modal-body-code');
  }, 300);
}

DOM.modalClose.addEventListener('click', closeModal);
DOM.modal.addEventListener('click', event => {
  if (event.target === DOM.modal) {
    closeModal();
  }
});
