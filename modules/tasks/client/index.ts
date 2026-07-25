import React from 'react';
import TaskModule from './TaskModule';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';

const moduleDefinition: ModuleClientDefinition = {
  code: 'TASKS',
  mainNav: {
    id: 'tasks',
    icon: 'fa-list-check'
  },
  views: {
    Tasks: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(TaskModule, { view: 'list', setView, currentUser, companyId, onSubTitleChange }),
    TaskCalendar: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(TaskModule, { view: 'calendar', setView, currentUser, companyId, onSubTitleChange }),
    Kanban: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(TaskModule, { view: 'kanban', setView, currentUser, companyId, onSubTitleChange }),
    TaskDetails: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(TaskModule, { view: 'details', setView, currentUser, companyId, onSubTitleChange })
  },
  sidebarSections: [
    {
      label: 'modules.tasks.section',
      items: [
        { name: 'modules.tasks.myTasks', view: 'Tasks', icon: 'fa-list-check' },
        { name: 'modules.tasks.calendar', view: 'TaskCalendar', icon: 'fa-calendar-days' },
        { name: 'modules.tasks.kanban', view: 'Kanban', icon: 'fa-table-columns' }
      ]
    }
  ],
  breadcrumbs: {
    Tasks: { main: 'modules.tasks.section', sub: 'modules.tasks.myTasks' },
    TaskCalendar: { main: 'modules.tasks.section', sub: 'modules.tasks.calendar' },
    Kanban: { main: 'modules.tasks.section', sub: 'modules.tasks.kanban' },
    TaskDetails: { main: 'modules.tasks.section', sub: 'modules.tasks.details' }
  },
  translations: {
    en: {
      translation: {
        modules: {
          tasks: {
            section: 'Tasks',
            myTasks: 'My Tasks',
            calendar: 'Calendar',
            kanban: 'Kanban',
            details: 'Task Details'
          }
        }
      }
    },
    es: {
      translation: {
        modules: {
          tasks: {
            section: 'Tareas',
            myTasks: 'Mis tareas',
            calendar: 'Calendario',
            kanban: 'Kanban',
            details: 'Detalle de tarea'
          }
        }
      }
    }
  }
};

export default moduleDefinition;


