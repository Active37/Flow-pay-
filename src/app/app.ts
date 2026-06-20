import { ChangeDetectionStrategy, Component, inject, OnInit, PLATFORM_ID, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
}

interface Transaction {
  invoiceNumber: string;
  senderName: string;
  senderEmail: string;
  senderWallet: string;
  clientName: string;
  clientEmail: string;
  dueDate: string;
  createdAt: string;
  items: InvoiceItem[];
  total: number;
  status: 'PAID' | 'UNPAID';
  isRecurringGenerated?: boolean;
}

interface PdfData {
  invoiceNumber: string;
  senderName: string;
  senderEmail: string;
  senderWallet: string;
  clientName: string;
  clientEmail: string;
  dueDate: string;
  createdAt: string;
  items: InvoiceItem[];
  total?: number;
  status?: 'PAID' | 'UNPAID';
}

interface ClientProfile {
  id: string;
  name: string;
  email: string;
}

interface RecurringRule {
  id: string;
  clientName: string;
  clientEmail: string;
  senderName: string;
  senderEmail: string;
  senderWallet: string;
  frequency: 'WEEKLY' | 'MONTHLY';
  items: InvoiceItem[];
  total: number;
  autoSend: boolean;
  nextTriggerDate: string;
  lastTriggered?: string;
  isActive: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private platformId = inject(PLATFORM_ID);

  // Checks if the platform is browser to use window and localStorage safely
  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // Active navigation tab
  activeTab = signal<'creator' | 'history' | 'clients' | 'recurring'>('creator');

  // Active form signals
  invoiceNumber = signal<string>('FP-1024');
  senderName = signal<string>('Alex Vance');
  senderEmail = signal<string>('alex@vance.io');
  senderWallet = signal<string>('ARC-9x71C7656EC7ab88b098defB751B7401B5f6d89');
  clientName = signal<string>('');
  clientEmail = signal<string>('');
  dueDate = signal<string>('');
  items = signal<InvoiceItem[]>([
    { description: 'Subsmart Compiler Optimization', quantity: 1, rate: 2400 },
    { description: 'Web3 Gateway Integration (V3)', quantity: 30, rate: 80 }
  ]);

  // Recurring options on creator
  isRecurringInvoice = signal<boolean>(false);
  recurringFrequency = signal<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  recurringAutoSend = signal<boolean>(true);

  // Toggle to auto-save client on invoice logged
  autoSaveClientOnSubmit = signal<boolean>(true);

  // Transformed state
  totalUsdc = computed(() => {
    return this.items().reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0);
  });

  // Client view state (when loading from a shared copy link)
  isClientView = signal<boolean>(false);

  // Core registries
  transactions = signal<Transaction[]>([]);
  clients = signal<ClientProfile[]>([]);
  recurringRules = signal<RecurringRule[]>([]);

  // Search & Filter state for History
  historySearch = signal<string>('');
  historyStatusFilter = signal<'ALL' | 'PAID' | 'UNPAID'>('ALL');
  historySortBy = signal<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  // Client Directory Forms
  newClientName = signal<string>('');
  newClientEmail = signal<string>('');

  // Computed and filtered transactional views
  filteredTransactions = computed(() => {
    let list = [...this.transactions()];
    const query = this.historySearch().toLowerCase().trim();
    const status = this.historyStatusFilter();
    const sort = this.historySortBy();

    if (query) {
      list = list.filter(t => 
        t.invoiceNumber.toLowerCase().includes(query) ||
        t.clientName.toLowerCase().includes(query) ||
        t.clientEmail.toLowerCase().includes(query) ||
        t.items.some(i => i.description.toLowerCase().includes(query))
      );
    }

    if (status !== 'ALL') {
      list = list.filter(t => t.status === status);
    }

    list.sort((a, b) => {
      if (sort === 'date-desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sort === 'date-asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sort === 'amount-desc') {
        return b.total - a.total;
      } else if (sort === 'amount-asc') {
        return a.total - b.total;
      }
      return 0;
    });

    return list;
  });

  // Client search select helper
  selectedClientDropdownId = signal<string>('');

  // Feedback notifications
  notification = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  private notificationTimeout: ReturnType<typeof setTimeout> | null = null;

  // Downloading status tracking
  isDownloadingId = signal<string | null>(null);

  // Pay Terminal (Modal state)
  paymentModalOpen = signal<boolean>(false);
  paymentInvoice = signal<Transaction | null>(null);
  paymentConsoleLines = signal<string[]>([]);
  paymentProcessing = signal<boolean>(false);
  paymentSuccess = signal<boolean>(false);

  ngOnInit() {
    // Set default due date: 7 days from now
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    this.dueDate.set(nextWeek.toISOString().split('T')[0]);

    if (this.isBrowser) {
      // 1. Process inline client URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('invoice');
      if (code) {
        try {
          const decoded = decodeURIComponent(atob(code));
          const decodedObj = JSON.parse(decoded);
          
          this.invoiceNumber.set(decodedObj.invoiceNumber || 'FP-LINK');
          this.senderName.set(decodedObj.senderName || '');
          this.senderEmail.set(decodedObj.senderEmail || '');
          this.senderWallet.set(decodedObj.senderWallet || '');
          this.clientName.set(decodedObj.clientName || '');
          this.clientEmail.set(decodedObj.clientEmail || '');
          this.dueDate.set(decodedObj.dueDate || '');
          this.items.set(decodedObj.items || []);
          this.isClientView.set(true);
          
          this.showFloatingNotification('Loaded shareable invoice preview successfully.', 'info');
        } catch (e) {
          console.error('Error parsing inline invoice URL data:', e);
          this.showFloatingNotification('Could not parse shareable invoice url.', 'error');
        }
      }

      // 2. Load Core Database registries
      this.loadAllFromStorage();

      // 3. Process automated recurring checks on startup (Simulates background automated engine)
      this.runAutomatedRecurringCheck();
    }
  }

  // Load state registries
  private loadAllFromStorage() {
    if (!this.isBrowser) return;

    // A. Transactions
    const localTxs = localStorage.getItem('flowpay_transactions');
    if (localTxs) {
      try {
        this.transactions.set(JSON.parse(localTxs));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Seed default transactions
      const sampleTxs: Transaction[] = [
        {
          invoiceNumber: 'FP-1022',
          senderName: 'Alex Vance',
          senderEmail: 'alex@vance.io',
          senderWallet: 'ARC-9x71C7656EC7ab88b098defB751B7401B5f6d89',
          clientName: 'Sovereign Node LLC',
          clientEmail: 'claims@sovereign-node.io',
          dueDate: '2026-06-12',
          createdAt: '2026-06-05',
          items: [{ description: 'High-Throughput RPC Orchestration', quantity: 1, rate: 3200 }],
          total: 3200,
          status: 'PAID'
        },
        {
          invoiceNumber: 'FP-1023',
          senderName: 'Alex Vance',
          senderEmail: 'alex@vance.io',
          senderWallet: 'ARC-9x71C7656EC7ab88b098defB751B7401B5f6d89',
          clientName: 'Galactic Horizon Inc',
          clientEmail: 'billing@horizon.xyz',
          dueDate: '2026-06-25',
          createdAt: '2026-06-18',
          items: [{ description: 'Frontend DApp Design Refactor', quantity: 12, rate: 120 }],
          total: 1440,
          status: 'UNPAID'
        }
      ];
      this.transactions.set(sampleTxs);
      localStorage.setItem('flowpay_transactions', JSON.stringify(sampleTxs));
    }

    // B. Clients Directory
    const localClients = localStorage.getItem('flowpay_clients');
    if (localClients) {
      try {
        this.clients.set(JSON.parse(localClients));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Seed default clients
      const sampleClients: ClientProfile[] = [
        { id: '1', name: 'Sovereign Node LLC', email: 'claims@sovereign-node.io' },
        { id: '2', name: 'Galactic Horizon Inc', email: 'billing@horizon.xyz' },
        { id: '3', name: 'Aether Nexus Lab', email: 'treasury@aethernexus.network' }
      ];
      this.clients.set(sampleClients);
      localStorage.setItem('flowpay_clients', JSON.stringify(sampleClients));
    }

    // C. Recurring Schedules
    const localRules = localStorage.getItem('flowpay_recurring_rules');
    if (localRules) {
      try {
        this.recurringRules.set(JSON.parse(localRules));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Seed default monthly retainer
      const sampleRules: RecurringRule[] = [
        {
          id: 'rule_100',
          clientName: 'Sovereign Node LLC',
          clientEmail: 'claims@sovereign-node.io',
          senderName: 'Alex Vance',
          senderEmail: 'alex@vance.io',
          senderWallet: 'ARC-9x71C7656EC7ab88b098defB751B7401B5f6d89',
          frequency: 'MONTHLY',
          items: [{ description: 'High-Throughput RPC Orchestration Retainer', quantity: 1, rate: 3200 }],
          total: 3200,
          autoSend: true,
          nextTriggerDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 10 days from now
          isActive: true
        }
      ];
      this.recurringRules.set(sampleRules);
      localStorage.setItem('flowpay_recurring_rules', JSON.stringify(sampleRules));
    }
  }

  // Synchronous engine to verify and fire due recurring billing metrics
  runAutomatedRecurringCheck() {
    if (!this.isBrowser) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayNum = new Date(todayStr).getTime();
    let rulesUpdated = false;
    let newlyCreatedCount = 0;

    const currentRules = [...this.recurringRules()];
    const currentTransactions = [...this.transactions()];

    currentRules.forEach((rule) => {
      const nextTriggerNum = new Date(rule.nextTriggerDate).getTime();
      
      if (rule.isActive && nextTriggerNum <= todayNum) {
        rulesUpdated = true;
        newlyCreatedCount++;

        // Generate historic sequential invoice number
        const autoNo = `FP-REC-${Math.floor(100000 + Math.random() * 900000)}`;
        
        // Calculate due date (default + 7 days from triggered day)
        const dDate = new Date();
        dDate.setDate(dDate.getDate() + 7);
        const dDateStr = dDate.toISOString().split('T')[0];

        // Spawn dynamic invoice transaction
        const spawnedTx: Transaction = {
          invoiceNumber: autoNo,
          senderName: rule.senderName,
          senderEmail: rule.senderEmail,
          senderWallet: rule.senderWallet,
          clientName: rule.clientName,
          clientEmail: rule.clientEmail,
          dueDate: dDateStr,
          createdAt: todayStr,
          items: JSON.parse(JSON.stringify(rule.items)),
          total: rule.total,
          status: 'UNPAID',
          isRecurringGenerated: true
        };

        currentTransactions.unshift(spawnedTx);

        // Calculate next recur interval based on frequency settings
        const nextDate = new Date(rule.nextTriggerDate);
        if (rule.frequency === 'WEEKLY') {
          nextDate.setDate(nextDate.getDate() + 7);
        } else {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }

        rule.lastTriggered = todayStr;
        rule.nextTriggerDate = nextDate.toISOString().split('T')[0];
      }
    });

    if (rulesUpdated) {
      this.transactions.set(currentTransactions);
      this.recurringRules.set(currentRules);
      localStorage.setItem('flowpay_transactions', JSON.stringify(currentTransactions));
      localStorage.setItem('flowpay_recurring_rules', JSON.stringify(currentRules));

      this.showFloatingNotification(`Automated billing fired: Generated ${newlyCreatedCount} recurring invoice(s) for active retainers.`, 'success');
    }
  }

  // Handler for custom dropdown selection to instantly bind form values
  selectClient(clientId: string) {
    if (!clientId) return;
    const client = this.clients().find(c => c.id === clientId);
    if (client) {
      this.clientName.set(client.name);
      this.clientEmail.set(client.email);
      this.selectedClientDropdownId.set(clientId);
      this.showFloatingNotification(`Pre-filled client billing info for ${client.name}`, 'info');
    }
  }

  // Manual fast save client to the roster from sidebar inputs
  createNewClientDirect() {
    const cName = this.newClientName().trim();
    const cEmail = this.newClientEmail().trim();

    if (!cName || !cEmail) {
      this.showFloatingNotification('Both Name and Email are required to register client.', 'error');
      return;
    }

    const nextId = String(Date.now());
    const newClient: ClientProfile = { id: nextId, name: cName, email: cEmail };

    this.clients.update(list => [...list, newClient]);
    this.saveClientsToStorage();

    this.newClientName.set('');
    this.newClientEmail.set('');
    this.showFloatingNotification(`Client "${cName}" saved successfully.`, 'success');
  }

  deleteClient(id: string) {
    this.clients.update(list => list.filter(c => c.id !== id));
    this.saveClientsToStorage();
    this.showFloatingNotification('Client removed from directory.', 'info');
  }

  private saveClientsToStorage() {
    if (this.isBrowser) {
      localStorage.setItem('flowpay_clients', JSON.stringify(this.clients()));
    }
  }

  // Manage form item entries
  addItem() {
    this.items.update(current => [...current, { description: '', quantity: 1, rate: 0 }]);
  }

  updateItem(index: number, field: 'description' | 'quantity' | 'rate', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.items.update(current => {
      const copy = [...current];
      if (field === 'description') {
        copy[index].description = value;
      } else if (field === 'quantity') {
        copy[index].quantity = parseFloat(value) || 0;
      } else if (field === 'rate') {
        copy[index].rate = parseFloat(value) || 0;
      }
      return copy;
    });
  }

  removeItem(index: number) {
    if (this.items().length <= 1) {
      this.showFloatingNotification('An invoice must contain at least one line item.', 'info');
      return;
    }
    this.items.update(current => current.filter((_, idx) => idx !== index));
  }

  // Action: Reset client view to start creating invoices
  resetToCreatorMode() {
    this.isClientView.set(false);
    this.invoiceNumber.set(`FP-${Math.floor(1000 + Math.random() * 9000)}`);
    this.senderName.set('Alex Vance');
    this.senderEmail.set('alex@vance.io');
    this.senderWallet.set('ARC-9x71C7656EC7ab88b098defB751B7401B5f6d89');
    this.clientName.set('');
    this.clientEmail.set('');
    this.isRecurringInvoice.set(false);
    this.items.set([{ description: 'Performance Consulting', quantity: 10, rate: 100 }]);

    if (this.isBrowser) {
      const url = new URL(window.location.href);
      url.searchParams.delete('invoice');
      window.history.pushState({}, '', url.toString());
    }
  }

  // Action: Save dynamic inputs to the list of transactions
  saveInvoice() {
    const sName = this.senderName().trim();
    const sEmail = this.senderEmail().trim();
    const sWallet = this.senderWallet().trim();
    const cName = this.clientName().trim();
    const cEmail = this.clientEmail().trim();
    const dDate = this.dueDate().trim();

    if (!sName) {
      this.showFloatingNotification('Freelancer name is required.', 'error');
      return;
    }
    if (!cName) {
      this.showFloatingNotification('Client name is required.', 'error');
      return;
    }
    if (this.items().some(i => !i.description.trim())) {
      this.showFloatingNotification('Please ensure all item descriptions are filled in.', 'error');
      return;
    }

    const currentTx: Transaction = {
      invoiceNumber: this.invoiceNumber(),
      senderName: sName,
      senderEmail: sEmail,
      senderWallet: sWallet,
      clientName: cName,
      clientEmail: cEmail,
      dueDate: dDate,
      createdAt: new Date().toISOString().split('T')[0],
      items: JSON.parse(JSON.stringify(this.items())),
      total: this.totalUsdc(),
      status: 'UNPAID'
    };

    // Save transaction
    this.transactions.update(txs => [currentTx, ...txs]);
    this.saveTransactionsToStorage();

    // Optionally auto-save client profiles to dynamic autocomplete logs if not existing
    if (this.autoSaveClientOnSubmit()) {
      const clientExists = this.clients().some(c => c.name.toLowerCase() === cName.toLowerCase() || c.email.toLowerCase() === cEmail.toLowerCase());
      if (!clientExists) {
        const newC: ClientProfile = { id: String(Date.now()), name: cName, email: cEmail };
        this.clients.update(list => [...list, newC]);
        this.saveClientsToStorage();
      }
    }

    // Set recurring job rules if checked
    if (this.isRecurringInvoice()) {
      const scheduleInterval = this.recurringFrequency();
      const trigDate = new Date();
      if (scheduleInterval === 'WEEKLY') {
        trigDate.setDate(trigDate.getDate() + 7);
      } else {
        trigDate.setMonth(trigDate.getMonth() + 1);
      }

      const rule: RecurringRule = {
        id: `rule_${Date.now()}`,
        clientName: cName,
        clientEmail: cEmail,
        senderName: sName,
        senderEmail: sEmail,
        senderWallet: sWallet,
        frequency: scheduleInterval,
        items: JSON.parse(JSON.stringify(this.items())),
        total: this.totalUsdc(),
        autoSend: this.recurringAutoSend(),
        nextTriggerDate: trigDate.toISOString().split('T')[0],
        isActive: true
      };

      this.recurringRules.update(list => [rule, ...list]);
      this.saveRecurringRulesToStorage();
      this.showFloatingNotification(`Invoice created & recurring schedule registered [Next Recur: ${rule.nextTriggerDate}]`, 'success');
    } else {
      this.showFloatingNotification(`Invoice ${currentTx.invoiceNumber} recorded successfully!`, 'success');
    }

    // Auto increment Invoice ID
    const match = currentTx.invoiceNumber.match(/^([A-Za-z]+[-_]?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const nextNum = parseInt(match[2], 10) + 1;
      this.invoiceNumber.set(`${prefix}${nextNum}`);
    } else {
      this.invoiceNumber.set(`FP-${Math.floor(1000 + Math.random() * 9000)}`);
    }

    // Move to history tab to help them verify immediately
    this.activeTab.set('history');
  }

  // Action: Delete invoice from local log
  deleteTransaction(invoiceNumber: string) {
    this.transactions.update(txs => txs.filter(t => t.invoiceNumber !== invoiceNumber));
    this.saveTransactionsToStorage();
    this.showFloatingNotification(`Invoice ${invoiceNumber} deleted.`, 'info');
  }

  private saveTransactionsToStorage() {
    if (this.isBrowser) {
      localStorage.setItem('flowpay_transactions', JSON.stringify(this.transactions()));
    }
  }

  // Recurring schedules manager
  toggleRecurringRule(id: string) {
    this.recurringRules.update(rules => rules.map(r => {
      if (r.id === id) {
        const nextState = !r.isActive;
        this.showFloatingNotification(`Recurring profile ${nextState ? 'enabled' : 'deactivated'}.`, 'info');
        return { ...r, isActive: nextState };
      }
      return r;
    }));
    this.saveRecurringRulesToStorage();
  }

  deleteRecurringRule(id: string) {
    this.recurringRules.update(rules => rules.filter(r => r.id !== id));
    this.saveRecurringRulesToStorage();
    this.showFloatingNotification('Recurring billing rule deleted.', 'info');
  }

  private saveRecurringRulesToStorage() {
    if (this.isBrowser) {
      localStorage.setItem('flowpay_recurring_rules', JSON.stringify(this.recurringRules()));
    }
  }

  // Action: Copy complete web share link to invoice
  copyInvoiceShareUrl(specificInvoice?: Transaction) {
    if (!this.isBrowser) return;

    let targetData;
    if (specificInvoice) {
      targetData = {
        invoiceNumber: specificInvoice.invoiceNumber,
        senderName: specificInvoice.senderName,
        senderEmail: specificInvoice.senderEmail,
        senderWallet: specificInvoice.senderWallet,
        clientName: specificInvoice.clientName,
        clientEmail: specificInvoice.clientEmail,
        dueDate: specificInvoice.dueDate,
        items: specificInvoice.items
      };
    } else {
      targetData = {
        invoiceNumber: this.invoiceNumber(),
        senderName: this.senderName(),
        senderEmail: this.senderEmail(),
        senderWallet: this.senderWallet(),
        clientName: this.clientName(),
        clientEmail: this.clientEmail(),
        dueDate: this.dueDate(),
        items: this.items()
      };
    }

    try {
      const jsonStr = JSON.stringify(targetData);
      const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const shareUrl = `${window.location.origin}?invoice=${base64}`;

      navigator.clipboard.writeText(shareUrl).then(() => {
        this.showFloatingNotification(`Shareable URL for ${targetData.invoiceNumber} copied successfully!`, 'success');
      }).catch(err => {
        console.error(err);
        this.showFloatingNotification('Clipboard access denied.', 'error');
      });
    } catch (e) {
      console.error(e);
      this.showFloatingNotification('Could not generate share link.', 'error');
    }
  }

  // Action: Download official PDF through full-stack Node endpoint
  downloadInvoicePdf(invoiceData: PdfData) {
    if (!this.isBrowser) return;

    this.isDownloadingId.set(invoiceData.invoiceNumber);

    fetch('/api/invoice/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoiceData)
    })
    .then(async response => {
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to download PDF.');
      }
      return response.blob();
    })
    .then(blob => {
      const blobUrl = window.URL.createObjectURL(blob);
      const hostA = document.createElement('a');
      hostA.href = blobUrl;
      hostA.download = `Invoice-${invoiceData.invoiceNumber || 'FLOWPAY'}.pdf`;
      document.body.appendChild(hostA);
      hostA.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(hostA);
      
      this.isDownloadingId.set(null);
      this.showFloatingNotification(`PDF downloaded for ${invoiceData.invoiceNumber}!`, 'success');
    })
    .catch(err => {
      console.error(err);
      this.isDownloadingId.set(null);
      this.showFloatingNotification('PDF generation server is offline or loading.', 'error');
    });
  }

  // Action: Print the active preview directly from the UI
  printInvoice() {
    if (this.isBrowser) {
      window.print();
    }
  }

  // Action: Loads a historical invoice into preview, focuses creator tab, and prints
  printInvoiceDirect(tx: Transaction) {
    if (!this.isBrowser) return;
    
    this.invoiceNumber.set(tx.invoiceNumber);
    this.senderName.set(tx.senderName);
    this.senderEmail.set(tx.senderEmail);
    this.senderWallet.set(tx.senderWallet);
    this.clientName.set(tx.clientName);
    this.clientEmail.set(tx.clientEmail);
    this.dueDate.set(tx.dueDate);
    this.items.set([...tx.items]);

    this.activeTab.set('creator');

    setTimeout(() => {
      window.print();
    }, 150);
  }

  // Action: Open ledger modal to perform on-chain pay simulation
  payInvoiceDirect(invoice: Transaction) {
    this.paymentInvoice.set(invoice);
    this.paymentConsoleLines.set([
      `[RPC] DISCOVERING TARGET METRIC ROUTE...`,
      `[MINT] SENDER ARC WALLET: ${invoice.senderWallet || 'UNDEFINED'}`,
      `[RATE] TRANSFER AMOUNT REQUEST: ${invoice.total.toFixed(2)} USDC`,
      `[STAT] TRANSACTION STATUS: UNSETTLED (QUEUE_A2)`,
      `[SYS] SECURE INTEROP LEDGER READY.`
    ]);
    this.paymentProcessing.set(false);
    this.paymentSuccess.set(false);
    this.paymentModalOpen.set(true);
  }

  // Triggered from active live preview
  payCurrentInvoice() {
    const currentInvoiceData: Transaction = {
      invoiceNumber: this.invoiceNumber(),
      senderName: this.senderName(),
      senderEmail: this.senderEmail(),
      senderWallet: this.senderWallet(),
      clientName: this.clientName(),
      clientEmail: this.clientEmail(),
      dueDate: this.dueDate(),
      createdAt: new Date().toISOString().split('T')[0],
      items: JSON.parse(JSON.stringify(this.items())),
      total: this.totalUsdc(),
      status: 'UNPAID'
    };

    if (!currentInvoiceData.senderName.trim() || !currentInvoiceData.clientName.trim()) {
      this.showFloatingNotification('Freelancer Name and Client Name are required to pay direct.', 'error');
      return;
    }

    // Save transaction to local log if not already there, so payment status updates nicely
    const exists = this.transactions().some(t => t.invoiceNumber === currentInvoiceData.invoiceNumber);
    if (!exists) {
      this.transactions.update(list => [currentInvoiceData, ...list]);
      this.saveTransactionsToStorage();
    }

    this.payInvoiceDirect(currentInvoiceData);
  }

  // Ledger execution simulation
  executeOnChainSettlement() {
    const invoice = this.paymentInvoice();
    if (!invoice) return;

    this.paymentProcessing.set(true);
    this.paymentConsoleLines.update(lines => [...lines, `[TX] INITIATING CRYPTOGRAPHIC KEY AGREEMENT...`]);

    const delayLogs = [
      { msg: `[TX] AUTHSIG: SECP256K1_ECDSA SIGNATURE CONFIRMED (1/2)`, delay: 500 },
      { msg: `[TX] GAS COST CALCULATION: 0.000104 MATIC`, delay: 1000 },
      { msg: `[MINT] DEPOSIT TO COLD METRIC ADDRESS SECURED`, delay: 1600 },
      { msg: `[TX] COMMITTING STATE TRANSACTION ON EVM BLOCKCHAIN...`, delay: 2200 },
      { msg: `[TX] CONSENSUS FORWARD COMPLETE: BLOCK NUM 58,193,849`, delay: 2800 },
      { msg: `[TX] SETTLED MEMO: 0x${Math.random().toString(16).substr(2, 10).toUpperCase()}aee8f5f2d9c`, delay: 3200 },
      { msg: `[SYS] STATUS RETURN: SUCCESSFUL STABLECOIN SETTLEMENT!`, delay: 3500 }
    ];

    delayLogs.forEach(entry => {
      setTimeout(() => {
        this.paymentConsoleLines.update(lines => [...lines, entry.msg]);
        if (entry.msg.includes('[SYS] STATUS')) {
          this.paymentProcessing.set(false);
          this.paymentSuccess.set(true);

          // Update transactions status
          this.transactions.update(txs => {
            const updated = txs.map(t => {
              if (t.invoiceNumber === invoice.invoiceNumber) {
                return { ...t, status: 'PAID' as const };
              }
              return t;
            });
            if (this.isBrowser) {
              localStorage.setItem('flowpay_transactions', JSON.stringify(updated));
            }
            return updated;
          });

          this.showFloatingNotification(`Settled ${invoice.total.toFixed(2)} USDC successfully!`, 'success');

          // Keep console alive then auto dismiss
          setTimeout(() => {
            this.paymentModalOpen.set(false);
          }, 3000);
        }
      }, entry.delay);
    });
  }

  // Copy plain text wallet destination
  copyWalletAddress(address: string) {
    if (!this.isBrowser) return;
    navigator.clipboard.writeText(address).then(() => {
      this.showFloatingNotification('Arc Wallet Address copied to clipboard!', 'info');
    });
  }

  // Helper function to create safe status class mapping
  getStatusClass(status: string): string {
    return status === 'PAID' 
      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800' 
      : 'bg-amber-950/40 text-amber-400 border border-amber-800';
  }

  // Global Notification System
  showFloatingNotification(message: string, type: 'success' | 'error' | 'info' = 'success') {
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }
    this.notification.set({ message, type });
    if (this.isBrowser) {
      this.notificationTimeout = setTimeout(() => {
        this.notification.set(null);
      }, 4000);
    }
  }

  closeNotification() {
    this.notification.set(null);
  }
}


