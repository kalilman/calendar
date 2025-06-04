// Load events from localStorage
function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem('events')) || [];
  } catch (e) {
    console.error('Failed to parse events', e);
    return [];
  }
}

// Save events to localStorage
function saveEvents(events) {
  localStorage.setItem('events', JSON.stringify(events));
}

document.addEventListener('DOMContentLoaded', function () {
  const calendarEl = document.getElementById('calendar');
  const modal = document.getElementById('event-modal');
  const titleInput = document.getElementById('event-title');
  const startInput = document.getElementById('event-start');
  const endInput = document.getElementById('event-end');
  const saveBtn = document.getElementById('save-event');
  const cancelBtn = document.getElementById('cancel-event');

  let currentEvent = null;
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    selectable: true,
    editable: true,
    events: loadEvents(),
    dateClick: function (info) {
      currentEvent = null;
      titleInput.value = '';
      startInput.value = info.dateStr + 'T09:00';
      endInput.value = info.dateStr + 'T10:00';
      modal.classList.remove('hidden');
    },
    eventClick: function (info) {
      currentEvent = info.event;
      titleInput.value = info.event.title;
      startInput.value = info.event.start.toISOString().slice(0,16);
      endInput.value = info.event.end ? info.event.end.toISOString().slice(0,16) : '';
      modal.classList.remove('hidden');
    },
    eventChange: function () {
      saveEvents(calendar.getEvents().map(e => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end
      })));
    }
  });
  calendar.render();

  saveBtn.addEventListener('click', function () {
    if (currentEvent) {
      currentEvent.setProp('title', titleInput.value);
      currentEvent.setStart(startInput.value);
      currentEvent.setEnd(endInput.value);
    } else {
      calendar.addEvent({
        title: titleInput.value,
        start: startInput.value,
        end: endInput.value
      });
    }
    saveEvents(calendar.getEvents().map(e => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end
    })));
    modal.classList.add('hidden');
  });

  cancelBtn.addEventListener('click', function () {
    modal.classList.add('hidden');
  });
});
