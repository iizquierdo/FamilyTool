export interface Customer {
  id: string;
  name: string;
  email: string;
  status: 'Lead' | 'Active' | 'Churned';
  value: number;
  lastContact: string;
}

export interface Task {
  id: string;
  title: string;
  taskId: string;
  description?: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Pending' | 'Inprogress' | 'Completed' | 'Ongoing' | 'In Review';
  assignedDate: string;
  targetDate: string;
  assignedTo: { name: string; avatar: string }[];
  category: 'Personal' | 'Work' | 'Health' | 'Daily' | 'Finance';
  image?: string;
  progress?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  price: number;
  category: string;
}

export type ViewType = string;

export interface InvoiceItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceId: string;
  clientName: string;
  clientEmail: string;
  clientAvatar?: string;
  issuedDate: string;
  dueDate: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue' | 'Due By 1 Day';
  items: InvoiceItem[];
}

export interface Project {
  id: string;
  name: string;
  status: 'In Progress' | 'Completed' | 'Yet to start';
  dueDate: string;
  openTasks: number;
  budgetSpent: string;
  description: string;
  category: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'Open' | 'Closed' | 'In Progress';
  priority: 'High' | 'Medium' | 'Low';
  category: 'React' | 'Laravel' | 'Vue' | 'Security';
  date: string;
}

export interface AppUser {
  id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  roleId?: string;
  roleRef?: Role;
  company?: Company;
  companyId?: string;
  lastLogin: string;
  twoStep: boolean;
  joinedDate: string;
  avatar?: string;
  language?: string;
  accessCompanyIds?: string[];
}

export interface Company {
  id: string;
  name: string;
  organizationId: string;
  code?: string;
  description?: string;
  status: 'Active' | 'Inactive';
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  vatCode?: string;
  notes?: string;
  language?: string;
  dateFormat?: string;
  timeFormat?: string;
  timezone?: string;
  baseCurrency?: string;
  moneyFormat?: string;
  currencyPosition?: string;
  defaultLanguage?: string;
  type?: string;
  category?: string;
  fullreference?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  address?: string;
  zipcode?: string;
}

export interface AppPermission {
  id: string;
  moduleId: string;
  roleId: string;
  canRead: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canDelete: boolean;
  moduleName?: string;
  moduleCode?: string;
  module?: SystemModule;
}

export interface SystemModule {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: 'Active' | 'Inactive';
}

export interface Role {
  id: string;
  name: string;
  totalUsers?: number;
  permissions?: AppPermission[];
}

export interface Subscription {
  id: string;
  customerName: string;
  email: string;
  status: 'Active' | 'Expiring' | 'Suspended';
  billing: string;
  product: string;
  createdDate: string;
  avatar?: string;
}

export interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: string;
  lastModified?: string;
}

export interface Message {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  time: string;
  tags: string[];
  isRead: boolean;
  avatar?: string;
  content?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'You' | string;
  text: string;
  time: string;
  avatar?: string;
}

export interface ChatThread {
  id: string;
  name: string;
  email: string;
  status: 'Active' | 'Offline';
  lastMessageTime: string;
  unreadCount?: number;
  avatar?: string;
  messages: ChatMessage[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  color: string;
}

export const SYSTEM_LANGUAGES = [
  { id: '1', code: 'en', name: 'English', flag: 'https://upload.wikimedia.org/wikipedia/en/a/a4/Flag_of_the_United_States.svg', status: 'Active' },
  { id: '2', code: 'es', name: 'Español', flag: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Flag_of_Spain.svg', status: 'Active' },
];
