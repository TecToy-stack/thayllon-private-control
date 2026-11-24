import {
  AppLanguage,
  EntryStatus,
  NavTab,
  PaymentMethod,
} from '../types/finance';

export const STORAGE_LANG_KEY = 'tpc_app_language';

export const LANGUAGE_OPTIONS: {
  id: AppLanguage;
  labelPt: string;
  nativeLabel: string;
  codeLabel: string;
}[] = [
  { id: 'pt', labelPt: 'Português', nativeLabel: 'Português (Nativo)', codeLabel: 'PT-BR' },
  { id: 'en', labelPt: 'Inglês', nativeLabel: 'English', codeLabel: 'EN' },
  { id: 'es', labelPt: 'Espanhol', nativeLabel: 'Español', codeLabel: 'ES' },
];

export function normalizeLanguage(raw?: unknown): AppLanguage {
  if (raw === 'en' || raw === 'es' || raw === 'pt') {
    return raw;
  }
  return 'pt';
}

export function loadStoredLanguage(): AppLanguage {
  try {
    if (typeof localStorage === 'undefined') return 'pt';
    return normalizeLanguage(localStorage.getItem(STORAGE_LANG_KEY));
  } catch {
    return 'pt';
  }
}

export function saveStoredLanguage(lang: AppLanguage): void {
  const safe = normalizeLanguage(lang);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_LANG_KEY, safe);
    }
  } catch {
    // Ignore storage quota / restricted iframe errors
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = safe === 'pt' ? 'pt-BR' : safe === 'en' ? 'en' : 'es';
  }
}

export function getIntlLocale(lang: AppLanguage): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'es') return 'es-ES';
  return 'pt-BR';
}

const MONTHS_FULL: Record<AppLanguage, readonly string[]> = {
  pt: [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
  ],
  en: [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ],
  es: [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  ],
};

const MONTHS_SHORT: Record<AppLanguage, readonly string[]> = {
  pt: ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'],
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
  es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
};

export function getMonthNamesFull(lang: AppLanguage): readonly string[] {
  return MONTHS_FULL[normalizeLanguage(lang)];
}

export function getMonthNamesShort(lang: AppLanguage): readonly string[] {
  return MONTHS_SHORT[normalizeLanguage(lang)];
}

export function translatePaymentMethod(
  method: PaymentMethod | undefined,
  lang: AppLanguage
): string {
  const l = normalizeLanguage(lang);
  if (l === 'en') {
    switch (method) {
      case 'credit': return 'Credit';
      case 'debit': return 'Debit';
      case 'pix': return 'Pix';
      case 'transfer': return 'Transfer';
      case 'cash': return 'Cash';
      default: return 'Debit / Manual';
    }
  }
  if (l === 'es') {
    switch (method) {
      case 'credit': return 'Crédito';
      case 'debit': return 'Débito';
      case 'pix': return 'Pix';
      case 'transfer': return 'Transferencia';
      case 'cash': return 'Efectivo';
      default: return 'Débito / Manual';
    }
  }
  switch (method) {
    case 'credit': return 'Crédito';
    case 'debit': return 'Débito';
    case 'pix': return 'Pix';
    case 'transfer': return 'Transferência';
    case 'cash': return 'Dinheiro';
    default: return 'Débito / Manual';
  }
}

export function translateEntryStatus(status: EntryStatus, lang: AppLanguage): string {
  const l = normalizeLanguage(lang);
  if (l === 'en') {
    return status === 'paid' ? 'Paid / Confirmed' : status === 'pending' ? 'Pending' : 'Projected';
  }
  if (l === 'es') {
    return status === 'paid' ? 'Pagado / Confirmado' : status === 'pending' ? 'Pendiente' : 'Proyectado';
  }
  return status === 'paid' ? 'Confirmado' : status === 'pending' ? 'Pendente' : 'Projetado';
}

export function translateGoalStatus(
  status: 'achieved' | 'ontrack' | 'behind',
  lang: AppLanguage
): string {
  const l = normalizeLanguage(lang);
  if (l === 'en') {
    return status === 'achieved' ? 'Goal Achieved' : status === 'behind' ? 'Behind Pace' : 'On Track';
  }
  if (l === 'es') {
    return status === 'achieved' ? 'Meta Alcanzada' : status === 'behind' ? 'Atención al Ritmo' : 'Buen Ritmo';
  }
  return status === 'achieved' ? 'Meta Atingida' : status === 'behind' ? 'Atenção ao ritmo' : 'Ritmo Saudável';
}

export interface AppTranslations {
  sidebar: {
    subtitle: string;
    closeMenu: string;
    navAria: string;
    nav: Record<NavTab, string>;
    openFinanceAttention: string;
    openFinanceActive: string;
    openFinanceEmpty: string;
    kycVerified: string;
    kycReview: string;
    kycPending: string;
    lockSession: string;
    logoutSwitchCpf: string;
  };
  topBar: {
    tabs: Record<NavTab, { section: string; subtitle: string }>;
    openMenu: string;
    showValuesTitle: string;
    hideValuesTitle: string;
    hiddenValues: string;
    hideValues: string;
    toLightTheme: string;
    toDarkTheme: string;
    toggleThemeAria: string;
    newEntry: string;
  };
  settings: {
    languageCardTitle: string;
    languageCardSubtitle: string;
    languageActiveLabel: string;
    languageSwitchedNotice: string;
    subTabs: {
      monitoring: string;
      goals: string;
      grid: string;
      security: string;
    };
    monitoring: {
      syncFrequency: string;
      every15m: string;
      every30m: string;
      every1h: string;
      every6h: string;
      anomalySensitivity: string;
      alertsInCenter: string;
      autoRulesTitle: string;
      autoRulesDesc: string;
      keywordPlaceholder: string;
      addRule: string;
      limitsTitle: string;
      averageLabel: string;
      noLimitPlaceholder: string;
      recurringTitle: string;
      anomaliesTitle: string;
      noAnomalies: string;
    };
    goals: {
      createTitle: string;
      createDesc: string;
      titleLabel: string;
      titlePlaceholder: string;
      targetLabel: string;
      deadlineLabel: string;
      baseLabel: string;
      baseResult: string;
      baseSavings: string;
      baseCombined: string;
      createBtn: string;
      monitoredTitle: string;
      noGoals: string;
      removeGoal: string;
      realProgress: string;
    };
    grid: {
      closingDay: string;
      variationDisplay: string;
      varBoth: string;
      varCurrency: string;
      varPercent: string;
      showZeroMonths: string;
      manageRowsTitle: string;
      blockIncome: string;
      blockFixed: string;
      blockVariable: string;
      blockSavings: string;
      newRowPlaceholder: string;
      dayPlaceholder: string;
      createRowBtn: string;
      dayLabel: string;
      visibleLabel: string;
      hiddenLabel: string;
    };
    security: {
      kycTitle: string;
      holderLabel: string;
      recordLabel: string;
      verified: string;
      underReview: string;
      pending: string;
      kycConfirmedPrefix: string;
      kycLast4Prefix: string;
      kycConfirmedSuffix: string;
      verifiedAt: string;
      officialDoc: string;
      last4Digits: string;
      validatingDoc: string;
      validateDocBtn: string;
      bioTitle: string;
      bioActive: string;
      bioInactive: string;
      registeredDevice: string;
      noDeviceLinked: string;
      bioReady: string;
      bioReinstallHint: string;
      bioEnableHint: string;
      reenableBio: string;
      enableBio: string;
      testBio: string;
      disableBio: string;
      pinTitle: string;
      currentPin: string;
      newPin: string;
      confirmPin: string;
      updatePinBtn: string;
      autoLock: string;
      minutesSuffix: string;
      hideOnOpen: string;
      lockOnBackground: string;
      lockOnBackgroundHint: string;
      rememberedCpfLabel: string;
      noSavedCpf: string;
      forgetCpf: string;
      maskCpfOnLogin: string;
      portabilityTitle: string;
      portabilityDesc: string;
      exportPdfBtn: string;
      exportJsonBtn: string;
      importJsonBtn: string;
      simulateReinstallBtn: string;
      loadDemoBtn: string;
      confirmLoadDemoBtn: string;
      clearAllBtn: string;
      confirmClearAllBtn: string;
      cancelBtn: string;
      msgJsonOk: string;
      msgJsonExported: string;
      msgJsonInvalid: string;
      msgPinDigits: string;
      msgPinMismatch: string;
      msgPinUpdated: string;
      msgPinError: string;
      msgBioLinked: string;
      msgBioConfigError: string;
      msgBioMissingLocal: string;
      msgBioValidated: string;
      msgBioTestError: string;
      msgBioDisabled: string;
      msgBioDisableError: string;
      msgKycDigits: string;
      msgKycSuccess: string;
      msgKycError: string;
      msgCpfForgotten: string;
      msgDemoLoaded: string;
      msgClearedAll: string;
    };
  };
  matrix: {
    monthInFocus: string;
    incomeIn: string;
    incomeSub: string;
    expensesIn: string;
    fixedShort: string;
    varShort: string;
    resultOf: string;
    surplusSub: string;
    deficitSub: string;
    cardInvoices: string;
    attentionBanner: string;
    checkConnectors: string;
    openFinanceTitle: string;
    accountsRatio: string;
    paymentDist: string;
    credit: string;
    debit: string;
    pix: string;
    spotMonth: string;
    installmentsMonth: string;
    remShort: string;
    dedupLabel: string;
    invoicesIn: string;
    closingShort: string;
    dueShort: string;
    availLimit: string;
    ofWord: string;
    directFeedTitle: string;
    directFeedSub: string;
    filterAll: string;
    filterIncome: string;
    searchFeedPlaceholder: string;
    noFeedMoves: string;
    noDuplicateTag: string;
    goalsTitle: string;
    configureGoals: string;
    noGoalsDefined: string;
    addFirstGoal: string;
    deadlinePrefix: string;
    tracksSavings: string;
    tracksResult: string;
    tracksCombined: string;
    currentLabel: string;
    missingPrefix: string;
    goalExceeded: string;
    annualIncome: string;
    annualExpense: string;
    annualNetResult: string;
    annualSaved: string;
    autoDetectedPrefix: string;
    autoDetectedSuffix: string;
    highlightPrefix: string;
    inspectCell: string;
    filterCategoryPlaceholder: string;
    hideZeroMonths: string;
    showAll12Months: string;
    downloadPdf: string;
    addRow: string;
    blockLabel: string;
    rowNameLabel: string;
    rowNamePlaceholder: string;
    refDayOpt: string;
    createRow: string;
    cancel: string;
    colCategoryRef: string;
    colConsolidated: string;
    block1Title: string;
    block1Sub: string;
    totalIncome: string;
    annualGainSub: string;
    block2Title: string;
    block2Sub: string;
    totalFixed: string;
    block3Title: string;
    block3Sub: string;
    totalVariable: string;
    totalExpenseRow: string;
    annualSpendSub: string;
    resultRow: string;
    neutral: string;
    surplus: string;
    attention: string;
    deficit: string;
    positiveBalance: string;
    negativeBalance: string;
    reserveContribution: string;
    totalValueSub: string;
    footerHint: string;
    activeCategories: string;
    entriesShort: string;
    moveUp: string;
    moveDown: string;
    hideRow: string;
  };
  timeline: {
    winMonth: string;
    winQuarter: string;
    winSemester: string;
    winYear: string;
    winProj12: string;
    refPrefix: string;
    allAccounts: string;
    manualEntries: string;
    accountPrefix: string;
    searchPlaceholder: string;
    showLabel: string;
    typeIncome: string;
    typeFixed: string;
    typeVariable: string;
    typeCards: string;
    typeSavings: string;
    typeAlerts: string;
    chartTitle: string;
    chartSub: string;
    minValley: string;
    maxPeak: string;
    accumBalance: string;
    noEventsFilter: string;
    noEventsWindow: string;
    movementsCount: string;
    installmentWord: string;
    invoiceDedupTag: string;
    internalDedupTag: string;
    alertTag: string;
    projBalanceShort: string;
  };
  openFinance: {
    title: string;
    connectedSuffix: string;
    subtitle: string;
    tabAll: string;
    tabConsents: string;
    tabSimulator: string;
    tabAudit: string;
    connectInstitution: string;
    limitReached: string;
  };
  accounts: {
    title: string;
    subtitle: string;
    connectBank: string;
    limitReached: string;
  };
  investments: {
    title: string;
    subtitlePrefix: string;
    subtitleSuffix: string;
    profileConservative: string;
    profileModerate: string;
    profileAggressive: string;
    initialCapital: string;
    monthlyContribution: string;
    termMonths: string;
    cdiRate: string;
    ipcaRate: string;
    scenarioPrefix: string;
    scenarioLabels: {
      conservative: string;
      base: string;
      optimistic: string;
    };
    totalContributed: string;
    compoundInterest: string;
    realReturn: string;
    curveTitle: string;
    monthsWord: string;
    legendContributed: string;
    legendConservative: string;
    legendBase: string;
    legendOptimistic: string;
    allocationTitle: string;
    colAssetClass: string;
    colVehicles: string;
    colRole: string;
    colAllocation: string;
    colInitialValue: string;
    educationalNote: string;
  };
  assistant: {
    integrated: string;
    friend: string;
    banker: string;
    clearChat: string;
    emptyTitle: string;
    emptyDesc: string;
    quickPrompts: string[];
    loadingText: string;
    errorTitle: string;
    inputPlaceholder: string;
    offlineError: string;
    contextTitle: string;
    contextSub: string;
    annualIncome: string;
    annualExpense: string;
    netResult: string;
    totalSaved: string;
    topVariable: string;
    monitoredAlerts: string;
    noActiveAlerts: string;
  };
  modals: {
    newEntryTitle: string;
    categoryRowLabel: string;
    groupIncome: string;
    groupFixed: string;
    groupVariable: string;
    groupSavings: string;
    monthLabel: string;
    dayLabel: string;
    amountLabel: string;
    methodLabel: string;
    accountLabel: string;
    manualAccount: string;
    statusLabel: string;
    statusPaid: string;
    statusPending: string;
    statusProjected: string;
    natureLabel: string;
    natureReal: string;
    natureInternal: string;
    natureInvoice: string;
    installmentLabel: string;
    ofTotalLabel: string;
    merchantLabel: string;
    merchantPlaceholder: string;
    cancel: string;
    saveEntry: string;
    cellTotal: string;
    monthlyAvg: string;
    overLimitTitle: string;
    overLimitDesc: string;
    directEditLabel: string;
    applyTotal: string;
    cellEntriesTitle: string;
    noCellEntries: string;
    addSingleEntryTitle: string;
    addEntryToCellBtn: string;
    notSummedTag: string;
    dayShort: string;
    lockTitle: string;
    pinInputLabel: string;
    unlockBtn: string;
    validating: string;
    unlockWithBio: string;
    waitingBio: string;
    endSessionSwitchCpf: string;
    bioNativeFooter: string;
    bioServerFooter: string;
    offlineBanner: string;
  };
  auth: {
    brandSubtitle: string;
    stageCpfKicker: string;
    stageCpfTitle: string;
    stageCpfDesc: string;
    cpfLabel: string;
    revealCpf: string;
    maskCpf: string;
    clearSwitchCpf: string;
    cpfHintEmpty: string;
    cpfDigitsCount: string;
    cpfRememberedReady: string;
    cpfValid: string;
    cpfInvalidCheck: string;
    lastVaultDevice: string;
    quickAccess: string;
    forgetCpf: string;
    checkingCpf: string;
    continueBtn: string;
    backChangeCpf: string;
    pinLabel: string;
    enterWithBio: string;
    validatingBio: string;
    enterWithPin: string;
    unlockingAccount: string;
    newRegKicker: string;
    stepOf3: string;
    step1Title: string;
    step2Title: string;
    step3Title: string;
    zeroGridTag: string;
    fullNameLabel: string;
    birthDateLabel: string;
    phoneLabel: string;
    emailLabel: string;
    goToKyc: string;
    kycStatusLabel: string;
    officialDocLabel: string;
    docLast4Label: string;
    validateDocBtn: string;
    validatingDocBtn: string;
    docValidatedBtn: string;
    backBtn: string;
    goToPinBio: string;
    continueLaterKyc: string;
    regPinLabel: string;
    confirmPinLabel: string;
    enableBioLabel: string;
    zeroStartBanner: string;
    finishCreateBtn: string;
    creatingVaultBtn: string;
    footerSecurity: string;
  };
  daily: {
    comparison: {
      title: string;
      vsLabel: string;
      income: string;
      expenses: string;
      netResult: string;
      noPrevMonthData: string;
      prevPrefix: string;
    };
    backup: {
      reminderTitle: string;
      offlineHint: string;
      onlineHint: string;
      lastBackupPrefix: string;
      neverBackedUp: string;
      exportBtn: string;
      dismissBtn: string;
    };
    tabs: {
      recurring: string;
      limits: string;
      installments: string;
      search: string;
    };
    recurring: {
      title: string;
      subtitle: string;
      pendingMonthTotal: string;
      overdueAlertSingular: string;
      overdueAlertPlural: string;
      dueSoonAlert: string;
      addBtn: string;
      titleLabel: string;
      titlePlaceholder: string;
      amountLabel: string;
      dueDayLabel: string;
      categoryLabel: string;
      noCategory: string;
      saveBtn: string;
      cancelBtn: string;
      statusPaid: string;
      statusPending: string;
      statusOverdue: string;
      dueDayShort: string;
      dueToday: string;
      dueInDaysPrefix: string;
      dueInDaysSuffix: string;
      emptyTitle: string;
      deleteTitle: string;
    };
    limits: {
      title: string;
      subtitle: string;
      overCeilingBadge: string;
      nearCeilingBadge: string;
      healthyBadge: string;
      noLimitBadge: string;
      setLimitBtn: string;
      editLimitBtn: string;
      limitPlaceholder: string;
      saveBtn: string;
      clearBtn: string;
      spentOf: string;
      remainingPrefix: string;
      exceededPrefix: string;
      emptyCategories: string;
    };
    search: {
      title: string;
      subtitle: string;
      placeholder: string;
      clearBtn: string;
      resultsSuffix: string;
      emptyHint: string;
      noResults: string;
      openCellHint: string;
      statusPaid: string;
      statusPending: string;
      statusProjected: string;
    };
    installments: {
      title: string;
      subtitle: string;
      activePlans: string;
      totalRemaining: string;
      nextMonthCommitted: string;
      paidCountLabel: string;
      remainingCountLabel: string;
      upcomingTitle: string;
      emptyTitle: string;
      paidLabel: string;
      remainingLabel: string;
      perMonthShort: string;
    };
  };
}

const PT_TRANSLATIONS: AppTranslations = {
  sidebar: {
    subtitle: 'Control · CF 2026+',
    closeMenu: 'Fechar menu',
    navAria: 'Navegação principal',
    nav: {
      matrix: 'Grade Mensal',
      timeline: 'Timeline',
      openfinance: 'Open Finance',
      accounts: 'Contas & Segurança',
      investments: 'Investimentos',
      assistant: 'Chat & Gerente',
      settings: 'Configurações',
    },
    openFinanceAttention: 'Requer atenção no consentimento',
    openFinanceActive: 'Consentimentos ativos',
    openFinanceEmpty: 'Nenhuma instituição conectada',
    kycVerified: 'Identidade Verificada',
    kycReview: 'KYC em análise',
    kycPending: 'KYC pendente',
    lockSession: 'Bloquear Sessão',
    logoutSwitchCpf: 'Sair / Trocar CPF',
  },
  topBar: {
    tabs: {
      matrix: {
        section: 'Grade Matricial Anual',
        subtitle: 'Fluxo consolidado de receitas, fixas, variáveis e reservas',
      },
      timeline: {
        section: 'Timeline & Projeção de Caixa',
        subtitle: 'Cronologia de vencimentos, entradas e saldo projetado',
      },
      openfinance: {
        section: 'Open Finance Brasil (OAuth 2.0 + PKCE)',
        subtitle: 'Consentimentos (até 5 contas), auto-categorização, simulador e trilha de auditoria',
      },
      accounts: {
        section: 'Contas & Segurança Bancária',
        subtitle: 'Integração Open Finance com até 5 instituições e auditoria',
      },
      investments: {
        section: 'Prospecção & Investimentos',
        subtitle: 'Simulador patrimonial e cenários de rentabilidade',
      },
      assistant: {
        section: 'Chat Amigo & Gerente Exclusivo',
        subtitle: 'Inteligência financeira em tempo real sobre seus dados',
      },
      settings: {
        section: 'Central de Configurações',
        subtitle: 'Idioma, monitoramento automático, estrutura da grade e privacidade',
      },
    },
    openMenu: 'Abrir menu',
    showValuesTitle: 'Mostrar valores financeiros',
    hideValuesTitle: 'Ocultar valores financeiros',
    hiddenValues: 'Valores Ocultos',
    hideValues: 'Ocultar Valores',
    toLightTheme: 'Alternar para Light Mode',
    toDarkTheme: 'Alternar para Dark Mode',
    toggleThemeAria: 'Alternar tema',
    newEntry: 'Novo Lançamento',
  },
  settings: {
    languageCardTitle: 'Idioma do Aplicativo',
    languageCardSubtitle: 'Altere o idioma da interface imediatamente. Português é o idioma nativo padrão.',
    languageActiveLabel: 'Ativo',
    languageSwitchedNotice: 'Idioma atualizado para Português (Nativo).',
    subTabs: {
      monitoring: 'Monitoramento Automático',
      goals: 'Metas de Economia',
      grid: 'Timeline & Grade',
      security: 'Segurança & Privacidade',
    },
    monitoring: {
      syncFrequency: 'Frequência de Sincronização Open Finance',
      every15m: 'A cada 15 minutos',
      every30m: 'A cada 30 minutos',
      every1h: 'A cada 1 hora',
      every6h: 'A cada 6 horas',
      anomalySensitivity: 'Sensibilidade do Detector de Picos (% acima da média)',
      alertsInCenter: 'Alertas na Central',
      autoRulesTitle: 'Regras de Auto-Categorização Bancária',
      autoRulesDesc: 'Palavras-chave detectadas nas descrições bancárias são direcionadas automaticamente para a linha correspondente da grade.',
      keywordPlaceholder: 'Palavra-chave (ex.: ifood, farmacia, pix)',
      addRule: 'Adicionar Regra',
      limitsTitle: 'Limites de Alerta por Categoria (Teto Mensal em R$)',
      averageLabel: 'Média',
      noLimitPlaceholder: 'Sem teto',
      recurringTitle: 'Assinaturas & Compromissos Recorrentes Detectados',
      anomaliesTitle: 'Anomalias & Picos Fora da Curva',
      noAnomalies: 'Nenhuma anomalia ou estouro de teto detectado no momento.',
    },
    goals: {
      createTitle: 'Definir Nova Meta de Economia',
      createDesc: 'Cada meta cadastrada aqui gera automaticamente uma barra de progresso em tempo real na interface principal da Grade Mensal e no Relatório PDF.',
      titleLabel: 'Título da Meta',
      titlePlaceholder: 'Ex.: Economizar R$ 10.000 até Dezembro',
      targetLabel: 'Valor Alvo (R$)',
      deadlineLabel: 'Prazo (Mês)',
      baseLabel: 'Base de Cálculo',
      baseResult: 'Resultado Líquido',
      baseSavings: 'Guardado (Reserva)',
      baseCombined: 'Guardado + Resultado',
      createBtn: 'Criar Meta',
      monitoredTitle: 'Metas Monitoradas',
      noGoals: 'Nenhuma meta cadastrada ainda.',
      removeGoal: 'Remover meta',
      realProgress: 'Progresso real',
    },
    grid: {
      closingDay: 'Dia de Fechamento / Corte do Mês',
      variationDisplay: 'Exibição de Variações',
      varBoth: 'Valor (R$) e Percentual (%)',
      varCurrency: 'Apenas Valor (R$)',
      varPercent: 'Apenas Percentual (%)',
      showZeroMonths: 'Exibir Meses Zerados (Jan/Fev/Dez)',
      manageRowsTitle: 'Gerenciar Linhas da Grade (Editar Dias D/XX, Reordenar, Ocultar ou Criar)',
      blockIncome: 'Receitas',
      blockFixed: 'Despesas Fixas',
      blockVariable: 'Despesas Variáveis',
      blockSavings: 'Reserva',
      newRowPlaceholder: 'Nome da nova linha',
      dayPlaceholder: 'Dia (1-31)',
      createRowBtn: 'Criar Linha',
      dayLabel: 'Dia:',
      visibleLabel: 'Visível',
      hiddenLabel: 'Reexibir',
    },
    security: {
      kycTitle: 'Identidade do Titular & Verificação KYC',
      holderLabel: 'Titular',
      recordLabel: 'Registro',
      verified: 'Verificado',
      underReview: 'Em análise',
      pending: 'Pendente',
      kycConfirmedPrefix: 'Documento',
      kycLast4Prefix: 'final',
      kycConfirmedSuffix: 'e prova de vida confirmados.',
      verifiedAt: 'Verificado em',
      officialDoc: 'Documento Oficial',
      last4Digits: '4 Últimos Dígitos',
      validatingDoc: 'Validando documento...',
      validateDocBtn: 'Validar Documento e Prova de Vida',
      bioTitle: 'Biometria Nativa Android & WebAuthn',
      bioActive: 'Ativa no Cofre',
      bioInactive: 'Desativada',
      registeredDevice: 'Dispositivo registrado:',
      noDeviceLinked: 'Nenhum dispositivo vinculado',
      bioReady: 'Autenticação biométrica pronta neste dispositivo.',
      bioReinstallHint: 'Este dispositivo ainda não foi pareado (ex.: após reinstalação). Reative abaixo.',
      bioEnableHint: 'Ative para desbloquear com Biometria Nativa Android (BiometricPrompt) ou Passkey WebAuthn.',
      reenableBio: 'Reativar neste Dispositivo',
      enableBio: 'Ativar Biometria',
      testBio: 'Testar Biometria',
      disableBio: 'Desativar',
      pinTitle: 'PIN de Contingência & Privacidade da Sessão',
      currentPin: 'PIN Atual',
      newPin: 'Novo PIN',
      confirmPin: 'Confirmar',
      updatePinBtn: 'Atualizar PIN Criptografado',
      autoLock: 'Bloqueio Automático',
      minutesSuffix: 'minutos',
      hideOnOpen: 'Ocultar Valores ao Abrir',
      lockOnBackground: 'Bloquear ao Minimizar ou Trocar de Aba',
      lockOnBackgroundHint: 'Exige PIN ou biometria ao retornar após minimizar o app, trocar de aba ou apagar a tela.',
      rememberedCpfLabel: 'Memória do último CPF na identificação:',
      noSavedCpf: 'Nenhum CPF salvo',
      forgetCpf: 'Esquecer CPF neste dispositivo',
      maskCpfOnLogin: 'Mascarar CPF pré-preenchido até focar/editar (Privacidade)',
      portabilityTitle: 'Portabilidade, Recuperação & Dados Operacionais',
      portabilityDesc: 'Sua conta fica salva no cofre persistente do servidor vinculado ao CPF. Exporte backups .json ou teste a recuperação pós-reinstalação quando desejar.',
      exportPdfBtn: 'Relatório Anual (PDF)',
      exportJsonBtn: 'Exportar Backup (.json)',
      importJsonBtn: 'Importar Backup (JSON)',
      simulateReinstallBtn: 'Simular Reinstalação (Limpar Cache & Sair)',
      loadDemoBtn: 'Carregar Dados de Exemplo (2026)',
      confirmLoadDemoBtn: 'Confirmar Carga Exemplo 2026',
      clearAllBtn: 'Zerar Todos os Dados Operacionais',
      confirmClearAllBtn: 'Confirmar Zerar Tudo',
      cancelBtn: 'Cancelar',
      msgJsonOk: 'Backup JSON importado e sincronizado com o cofre.',
      msgJsonExported: 'Backup JSON gerado e baixado com segurança.',
      msgJsonInvalid: 'Estrutura do arquivo JSON inválida.',
      msgPinDigits: 'PIN atual e novo PIN devem ter 4 a 6 dígitos.',
      msgPinMismatch: 'A confirmação do novo PIN não confere.',
      msgPinUpdated: 'PIN atualizado com hash criptográfico no cofre.',
      msgPinError: 'Erro ao atualizar PIN.',
      msgBioLinked: 'Biometria vinculada a este dispositivo',
      msgBioConfigError: 'Erro ao configurar biometria.',
      msgBioMissingLocal: 'Chave biométrica local não encontrada neste navegador. Clique em Reativar Biometria.',
      msgBioValidated: 'Biometria validada com sucesso',
      msgBioTestError: 'Falha ao testar biometria.',
      msgBioDisabled: 'Biometria desativada. Acesso mantido via PIN.',
      msgBioDisableError: 'Erro ao desativar biometria.',
      msgKycDigits: 'Informe os 4 últimos dígitos do documento para concluir o KYC.',
      msgKycSuccess: 'Identidade e prova de vida verificadas com sucesso no seu cofre.',
      msgKycError: 'Não foi possível concluir a verificação KYC.',
      msgCpfForgotten: 'Último CPF removido da memória rápida deste dispositivo.',
      msgDemoLoaded: 'Dados de exemplo 2026 carregados na grade, contas e metas.',
      msgClearedAll: 'Todos os dados operacionais foram zerados (R$ 0,00 / 0 de 5 contas).',
    },
  },
  matrix: {
    monthInFocus: 'Mês em Questão · Visão Principal',
    incomeIn: 'Receitas em',
    incomeSub: 'Entradas e saldo em caixa do mês',
    expensesIn: 'Gastos em',
    fixedShort: 'Fixas',
    varShort: 'Var',
    resultOf: 'Resultado de',
    surplusSub: 'Superávit disponível no mês',
    deficitSub: 'Atenção: déficit no mês',
    cardInvoices: 'Faturas de Cartão',
    attentionBanner: 'conta(s) requerem renovação de consentimento ou reconexão oficial.',
    checkConnectors: 'Verificar Conectores',
    openFinanceTitle: 'Open Finance · Crédito, Débito & Faturas',
    accountsRatio: 'Contas',
    paymentDist: 'Distribuição por Forma de Pagamento',
    credit: 'Crédito',
    debit: 'Débito',
    pix: 'Pix',
    spotMonth: 'À Vista no Mês',
    installmentsMonth: 'Parcelado',
    remShort: 'Rest.',
    dedupLabel: 'transf. interna(s)/pgto(s) de fatura desduplicados',
    invoicesIn: 'Faturas de Cartão de Crédito em',
    closingShort: 'Fech.',
    dueShort: 'Venc.',
    availLimit: 'Lim. disp.',
    ofWord: 'de',
    directFeedTitle: 'Extrato Direto das Contas · Onde Foi Gasto',
    directFeedSub: 'Rastreamento por estabelecimento, conta conectada e modalidade (Crédito / Débito / Pix)',
    filterAll: 'Todos',
    filterIncome: 'Entradas',
    searchFeedPlaceholder: 'Buscar onde foi gasto, categoria ou banco...',
    noFeedMoves: 'Nenhuma movimentação encontrada para este filtro em',
    noDuplicateTag: 'Não duplica gasto',
    goalsTitle: 'Metas de Economia',
    configureGoals: 'Configurar Metas na Central',
    noGoalsDefined: 'Nenhuma meta de economia definida.',
    addFirstGoal: 'Adicionar primeira meta',
    deadlinePrefix: 'Prazo:',
    tracksSavings: 'Acompanha Guardado',
    tracksResult: 'Acompanha Resultado Líquido',
    tracksCombined: 'Acompanha Guardado + Resultado',
    currentLabel: 'Atual:',
    missingPrefix: 'Faltam',
    goalExceeded: 'superada',
    annualIncome: 'Ganho Total Anual',
    annualExpense: 'Gasto Total Anual',
    annualNetResult: 'Resultado Líquido Anual',
    annualSaved: 'Valor Total Guardado',
    autoDetectedPrefix: 'Monitoramento Automático detectou',
    autoDetectedSuffix: 'evento(s) de atenção',
    highlightPrefix: 'Destaque:',
    inspectCell: 'Inspecionar Célula',
    filterCategoryPlaceholder: 'Filtrar categoria...',
    hideZeroMonths: 'Ocultar Meses Zerados',
    showAll12Months: 'Mostrar Todos os 12 Meses',
    downloadPdf: 'Baixar Relatório Anual (PDF)',
    addRow: 'Adicionar Linha',
    blockLabel: 'Bloco',
    rowNameLabel: 'Nome da Categoria / Fonte',
    rowNamePlaceholder: 'Ex.: FREELANCE ou ACADEMIA',
    refDayOpt: 'Dia Ref. (opcional)',
    createRow: 'Criar Linha',
    cancel: 'Cancelar',
    colCategoryRef: 'Categoria / Referência',
    colConsolidated: 'Consolidado',
    block1Title: 'Bloco 1 · Receitas',
    block1Sub: 'Fontes de entrada, salários, extras e valor em caixa',
    totalIncome: 'TOTAL (Receitas)',
    annualGainSub: 'GANHO TOTAL ANUAL',
    block2Title: 'Bloco 2 · Despesas F (Fixas)',
    block2Sub: 'Compromissos mensais recorrentes e assinaturas',
    totalFixed: 'TOTAL FIXAS',
    block3Title: 'Bloco 3 · Despesas V (Variáveis)',
    block3Sub: 'Consumo, faturas de cartão, impostos anuais e lazer',
    totalVariable: 'TOTAL VARIAVEL',
    totalExpenseRow: 'TOTAL DE GASTO (Fixas + Variáveis)',
    annualSpendSub: 'GASTO TOTAL ANUAL',
    resultRow: 'RESULTADO (Receitas − Gastos)',
    neutral: 'Neutro',
    surplus: 'Superávit',
    attention: 'Atenção',
    deficit: 'Déficit',
    positiveBalance: 'Saldo Positivo',
    negativeBalance: 'Saldo Negativo',
    reserveContribution: 'Aporte Reserva',
    totalValueSub: 'VALOR TOTAL',
    footerHint: 'Clique em qualquer célula ou coluna de mês para detalhar lançamentos, faturas ou trocar o mês em questão.',
    activeCategories: 'categorias ativas',
    entriesShort: 'lanç.',
    moveUp: 'Mover para cima',
    moveDown: 'Mover para baixo',
    hideRow: 'Ocultar linha',
  },
  timeline: {
    winMonth: 'Mês Atual',
    winQuarter: 'Trimestre',
    winSemester: 'Semestre',
    winYear: 'Ano Completo',
    winProj12: 'Projeção 6–12m',
    refPrefix: 'Ref.:',
    allAccounts: 'Todas as Contas',
    manualEntries: 'Lançamentos Manuais',
    accountPrefix: 'Conta',
    searchPlaceholder: 'Buscar evento...',
    showLabel: 'Exibir:',
    typeIncome: 'Receitas',
    typeFixed: 'Despesas Fixas',
    typeVariable: 'Despesas Variáveis',
    typeCards: 'Cartões',
    typeSavings: 'Guardado & Investimentos',
    typeAlerts: 'Alertas',
    chartTitle: 'Saldo Projetado ao Longo do Tempo',
    chartSub: 'Evolução acumulada entre entradas, vencimentos e aportes no período filtrado',
    minValley: 'Vale mínimo:',
    maxPeak: 'Pico máximo:',
    accumBalance: 'Saldo acumulado:',
    noEventsFilter: 'Nenhum evento corresponde aos filtros selecionados.',
    noEventsWindow: 'Nenhum lançamento encontrado na janela selecionada. Ajuste os filtros acima para visualizar os marcos.',
    movementsCount: 'movimentações',
    installmentWord: 'Parcela',
    invoiceDedupTag: 'Pgto Fatura · Não duplica gasto',
    internalDedupTag: 'Transf. Interna · Não duplica',
    alertTag: 'Alerta',
    projBalanceShort: 'Saldo proj.:',
  },
  openFinance: {
    title: 'Gestão de Consentimentos Open Finance Brasil',
    connectedSuffix: 'contas conectadas',
    subtitle: 'Autorização via OAuth 2.0 + PKCE (FAPI) · TLS 1.3 · Tokenização AES-256 somente leitura. Nunca coletamos senhas bancárias, PINs, MFA ou CVV.',
    tabAll: 'Visão Completa',
    tabConsents: 'Contas & Consentimentos',
    tabSimulator: 'Simulador & Regras',
    tabAudit: 'Auditoria LGPD',
    connectInstitution: 'Conectar Nova Instituição',
    limitReached: 'Limite de 5/5 Contas Atingido',
  },
  accounts: {
    title: 'Contas Conectadas (Open Finance Seguro)',
    subtitle: 'Slots para até 5 instituições via OAuth 2.0 + PKCE somente leitura. Nenhuma senha bancária é armazenada.',
    connectBank: 'Conectar Instituição',
    limitReached: 'Limite de 5 Contas Atingido',
  },
  investments: {
    title: 'Simulador de Rentabilidade & Alocação Patrimonial',
    subtitlePrefix: 'Base sincronizada com sua reserva atual',
    subtitleSuffix: 'e capacidade mensal do fluxo',
    profileConservative: 'Conservador',
    profileModerate: 'Moderado',
    profileAggressive: 'Arrojado',
    initialCapital: 'Capital Inicial (R$)',
    monthlyContribution: 'Aporte Mensal (R$)',
    termMonths: 'Prazo (meses)',
    cdiRate: 'Taxa CDI Ref. (% a.a.)',
    ipcaRate: 'IPCA Estimado (% a.a.)',
    scenarioPrefix: 'Cenário',
    scenarioLabels: {
      conservative: 'Conservador',
      base: 'Base (Recomendado)',
      optimistic: 'Otimista',
    },
    totalContributed: 'Total Aportado:',
    compoundInterest: 'Juros Compostos:',
    realReturn: 'Ganho Real (acima IPCA):',
    curveTitle: 'Curva de Evolução Patrimonial',
    monthsWord: 'meses',
    legendContributed: 'Capital Aportado',
    legendConservative: 'Conservador',
    legendBase: 'Base',
    legendOptimistic: 'Otimista',
    allocationTitle: 'Sugestão de Alocação · Perfil',
    colAssetClass: 'Classe de Ativo',
    colVehicles: 'Instrumentos Típicos',
    colRole: 'Função na Carteira',
    colAllocation: 'Alocação',
    colInitialValue: 'Valor Inicial',
    educationalNote: 'Nota educativa: As projeções e sugestões de alocação acima têm caráter exclusivamente educativo e utilizam taxas de referência simuladas. Rentabilidade passada ou projetada não garante retorno futuro e depende das condições de mercado, tributação (IR/IOF) e liquidez dos ativos escolhidos.',
  },
  assistant: {
    integrated: 'Integrado',
    friend: 'Chat Amigo',
    banker: 'Gerente Exclusivo',
    clearChat: 'Limpar Conversa',
    emptyTitle: 'Consultoria em Tempo Real sobre seus Números',
    emptyDesc: 'Alterne entre o tom próximo do Chat Amigo e a precisão estratégica do Gerente Bancário Exclusivo. Todas as respostas leem sua grade, contas conectadas e reserva atual.',
    quickPrompts: [
      'Onde posso economizar mais este mês?',
      'Analisar à vista, parcelamentos restantes e limites dos cartões',
      'Quanto consigo investir sem apertar meu caixa?',
      'Verificar saúde dos consentimentos Open Finance e faturas',
    ],
    loadingText: 'Analisando seus lançamentos e projeções em tempo real...',
    errorTitle: 'Não foi possível obter resposta',
    inputPlaceholder: 'Pergunte sobre seus gastos, economia mensal ou onde investir...',
    offlineError: 'Assistente IA requer conexão com a internet. Seus dados financeiros locais continuam disponíveis offline.',
    contextTitle: 'Contexto Lido em Tempo Real',
    contextSub: 'Números sincronizados da sua Grade CF',
    annualIncome: 'Ganho Anual',
    annualExpense: 'Gasto Anual',
    netResult: 'Resultado Líquido',
    totalSaved: 'Guardado Total',
    topVariable: 'Maior Variável',
    monitoredAlerts: 'Alertas Monitorados',
    noActiveAlerts: 'Nenhum alerta ativo no momento.',
  },
  modals: {
    newEntryTitle: 'Novo Lançamento',
    categoryRowLabel: 'Categoria / Linha da Grade',
    groupIncome: 'Receitas',
    groupFixed: 'Despesas Fixas',
    groupVariable: 'Despesas Variáveis',
    groupSavings: 'Patrimônio / Guardado',
    monthLabel: 'Mês',
    dayLabel: 'Dia',
    amountLabel: 'Valor (R$)',
    methodLabel: 'Modalidade',
    accountLabel: 'Conta Bancária / Cartão',
    manualAccount: 'Manual / Dinheiro',
    statusLabel: 'Status',
    statusPaid: 'Pago / Recebido',
    statusPending: 'Pendente',
    statusProjected: 'Projetado',
    natureLabel: 'Natureza',
    natureReal: 'Real',
    natureInternal: 'Transf. Interna',
    natureInvoice: 'Pgto Fatura',
    installmentLabel: 'Parcela',
    ofTotalLabel: 'De (Total)',
    merchantLabel: 'Onde foi gasto / Estabelecimento',
    merchantPlaceholder: 'Ex.: Supermercado Assaí, Posto Shell, Restaurante...',
    cancel: 'Cancelar',
    saveEntry: 'Salvar Lançamento',
    cellTotal: 'Total da Célula',
    monthlyAvg: 'Média Mensal',
    overLimitTitle: 'Teto da categoria ultrapassado',
    overLimitDesc: 'Limite configurado em',
    directEditLabel: 'Edição Direta do Valor Consolidado (R$)',
    applyTotal: 'Aplicar Total',
    cellEntriesTitle: 'Lançamentos que compõem esta célula',
    noCellEntries: 'Nenhum lançamento registrado neste mês. Use o formulário abaixo para adicionar.',
    addSingleEntryTitle: 'Adicionar Novo Lançamento Pontual',
    addEntryToCellBtn: 'Adicionar Lançamento à Célula',
    notSummedTag: 'Não somado ao gasto',
    dayShort: 'Dia',
    lockTitle: 'Sessão Protegida',
    pinInputLabel: 'PIN de Acesso (4–6 dígitos)',
    unlockBtn: 'Desbloquear Painel',
    validating: 'Validando...',
    unlockWithBio: 'Desbloquear com',
    waitingBio: 'Aguardando biometria...',
    endSessionSwitchCpf: 'Encerrar Sessão / Trocar CPF',
    bioNativeFooter: 'Biometria Nativa Android · Cofre por CPF',
    bioServerFooter: 'Validação criptográfica no servidor · TLS 1.3',
    offlineBanner: 'Modo Offline — Cofre local (IndexedDB) ativo',
  },
  auth: {
    brandSubtitle: 'Cofre Patrimonial Vinculado ao CPF · KYC & Autenticação Biométrica',
    stageCpfKicker: 'Identificação do Titular',
    stageCpfTitle: 'Informe seu CPF para acessar ou criar seu cofre',
    stageCpfDesc: 'Seus dados ficam vinculados ao CPF e preservados com segurança mesmo após desinstalação ou limpeza do navegador.',
    cpfLabel: 'CPF do Titular',
    revealCpf: 'Revelar CPF',
    maskCpf: 'Mascarar CPF',
    clearSwitchCpf: 'Limpar / Trocar CPF',
    cpfHintEmpty: 'Validação real dos dígitos verificadores (Receita/CPF)',
    cpfDigitsCount: 'dígitos informados',
    cpfRememberedReady: 'Último CPF lembrado · pronto para autenticar',
    cpfValid: 'CPF válido',
    cpfInvalidCheck: 'Dígitos verificadores inválidos',
    lastVaultDevice: 'Último cofre acessado neste dispositivo:',
    quickAccess: 'Acesso rápido (PIN / Biometria)',
    forgetCpf: 'Esquecer CPF',
    checkingCpf: 'Verificando CPF...',
    continueBtn: 'Continuar',
    backChangeCpf: 'Trocar CPF',
    pinLabel: 'PIN de Acesso (4–6 dígitos)',
    enterWithBio: 'Entrar com Biometria',
    validatingBio: 'Validando biometria...',
    enterWithPin: 'Entrar com PIN e Restaurar Conta',
    unlockingAccount: 'Desbloqueando e restaurando cofre...',
    newRegKicker: 'Novo Cadastro',
    stepOf3: 'Etapa',
    step1Title: 'Dados Cadastrais do Titular',
    step2Title: 'Verificação de Identidade (KYC)',
    step3Title: 'PIN de Contingência & Biometria',
    zeroGridTag: 'Primeiro Acesso Real (Grade Zerada)',
    fullNameLabel: 'Nome Completo *',
    birthDateLabel: 'Data de Nascimento *',
    phoneLabel: 'Telefone (Opcional)',
    emailLabel: 'E-mail (Opcional)',
    goToKyc: 'Avançar para Verificação de Identidade',
    kycStatusLabel: 'Status atual do KYC:',
    officialDocLabel: 'Documento Oficial',
    docLast4Label: '4 Últimos Dígitos do Doc.',
    validateDocBtn: 'Executar Validação Documental & Prova de Vida',
    validatingDocBtn: 'Validando documento e prova de vida...',
    docValidatedBtn: 'Identidade e Prova de Vida Verificadas',
    backBtn: 'Voltar',
    goToPinBio: 'Avançar para PIN e Biometria',
    continueLaterKyc: 'Continuar (Concluir KYC depois)',
    regPinLabel: 'PIN de Acesso (4–6 dígitos) *',
    confirmPinLabel: 'Confirmar PIN *',
    enableBioLabel: 'Ativar Biometria neste dispositivo',
    zeroStartBanner: 'Primeiro Acesso Real: sua grade iniciará totalmente zerada (R$ 0,00 e 0/5 contas) pronta para seus lançamentos reais.',
    finishCreateBtn: 'Concluir Cadastro e Acessar',
    creatingVaultBtn: 'Criando Cofre Seguro...',
    footerSecurity: 'PIN protegido com hash criptográfico · Recuperação persistente por CPF',
  },
  daily: {
    comparison: {
      title: 'Resumo Mensal Comparativo',
      vsLabel: 'vs',
      income: 'Receitas',
      expenses: 'Despesas Totais',
      netResult: 'Saldo Líquido',
      noPrevMonthData: 'Sem base no mês anterior',
      prevPrefix: 'Ant.:',
    },
    backup: {
      reminderTitle: 'Existem alterações recentes sem backup JSON local',
      offlineHint: 'Você está operando em modo local/offline — baixe uma cópia .json para proteger seus lançamentos.',
      onlineHint: 'Recomendamos exportar um arquivo .json após atualizações importantes para cópia pessoal.',
      lastBackupPrefix: 'Último backup:',
      neverBackedUp: 'Nenhum backup exportado ainda',
      exportBtn: 'Exportar Backup (.json)',
      dismissBtn: 'Lembrar depois',
    },
    tabs: {
      recurring: 'Contas Recorrentes',
      limits: 'Limites por Categoria',
      installments: 'Parcelas Futuras',
      search: 'Busca Rápida',
    },
    recurring: {
      title: 'Contas Recorrentes & Vencimentos',
      subtitle: 'Acompanhe contas fixas mensais, datas de vencimento e pendências do mês',
      pendingMonthTotal: 'Pendente no mês',
      overdueAlertSingular: 'conta atrasada requer atenção imediata',
      overdueAlertPlural: 'contas atrasadas requerem atenção imediata',
      dueSoonAlert: 'conta(s) vencendo nos próximos dias',
      addBtn: 'Nova Conta Fixa',
      titleLabel: 'Descrição da Conta',
      titlePlaceholder: 'Ex.: Aluguel, Energia, Internet, Academia',
      amountLabel: 'Valor (R$)',
      dueDayLabel: 'Dia Venc.',
      categoryLabel: 'Categoria (opcional)',
      noCategory: 'Sem vínculo na grade',
      saveBtn: 'Salvar Conta',
      cancelBtn: 'Cancelar',
      statusPaid: 'Pago',
      statusPending: 'Pendente',
      statusOverdue: 'Atrasado',
      dueDayShort: 'Venc. D/',
      dueToday: 'Vence hoje',
      dueInDaysPrefix: 'Vence em',
      dueInDaysSuffix: 'd',
      emptyTitle: 'Nenhuma conta recorrente cadastrada ainda. Adicione aluguel, luz, internet ou assinaturas.',
      deleteTitle: 'Remover conta recorrente',
    },
    limits: {
      title: 'Planejamento & Limites por Categoria',
      subtitle: 'Defina tetos mensais de gasto e acompanhe o consumo em tempo real',
      overCeilingBadge: 'Acima do teto',
      nearCeilingBadge: 'Perto do limite',
      healthyBadge: 'Dentro do teto',
      noLimitBadge: 'Sem limite definido',
      setLimitBtn: 'Definir limite',
      editLimitBtn: 'Editar',
      limitPlaceholder: 'Limite (R$)',
      saveBtn: 'Salvar',
      clearBtn: 'Remover',
      spentOf: 'de',
      remainingPrefix: 'Restam',
      exceededPrefix: 'Excedido em',
      emptyCategories: 'Nenhuma categoria de despesa ativa encontrada.',
    },
    search: {
      title: 'Busca Rápida de Lançamentos',
      subtitle: 'Filtre instantaneamente por descrição, estabelecimento, categoria, valor ou status',
      placeholder: 'Buscar ex.: mercado, 885, pago, pendente, aluguel...',
      clearBtn: 'Limpar',
      resultsSuffix: 'lançamento(s)',
      emptyHint: 'Digite um termo ou selecione um filtro rápido para localizar lançamentos em',
      noResults: 'Nenhum lançamento encontrado para esta busca.',
      openCellHint: 'Abrir célula',
      statusPaid: 'Pago',
      statusPending: 'Pendente',
      statusProjected: 'Projetado',
    },
    installments: {
      title: 'Controle de Parcelas Futuras',
      subtitle: 'Acompanhe compras parceladas, parcelas pagas, restantes e impacto nos próximos meses',
      activePlans: 'Parcelamentos Ativos',
      totalRemaining: 'Saldo Total a Pagar',
      nextMonthCommitted: 'Comprometido Próx. Mês',
      paidCountLabel: 'pagas',
      remainingCountLabel: 'restantes',
      upcomingTitle: 'Projeção dos Próximos Meses',
      emptyTitle: 'Nenhuma compra parcelada registrada ainda (ex.: 2/10 em Novo Lançamento).',
      paidLabel: 'Pagas:',
      remainingLabel: 'Restantes:',
      perMonthShort: '/mês',
    },
  },
};

const EN_TRANSLATIONS: AppTranslations = {
  sidebar: {
    subtitle: 'Control · CF 2026+',
    closeMenu: 'Close menu',
    navAria: 'Main navigation',
    nav: {
      matrix: 'Monthly Grid',
      timeline: 'Timeline',
      openfinance: 'Open Finance',
      accounts: 'Accounts & Security',
      investments: 'Investments',
      assistant: 'Chat & Advisor',
      settings: 'Settings',
    },
    openFinanceAttention: 'Consent attention required',
    openFinanceActive: 'Active consents',
    openFinanceEmpty: 'No institution connected',
    kycVerified: 'Verified Identity',
    kycReview: 'KYC Under Review',
    kycPending: 'KYC Pending',
    lockSession: 'Lock Session',
    logoutSwitchCpf: 'Sign Out / Switch CPF',
  },
  topBar: {
    tabs: {
      matrix: {
        section: 'Annual Financial Matrix',
        subtitle: 'Consolidated cash flow across income, fixed, variable & savings',
      },
      timeline: {
        section: 'Timeline & Cash Projection',
        subtitle: 'Chronology of due dates, inflows and projected balance',
      },
      openfinance: {
        section: 'Open Finance Brazil (OAuth 2.0 + PKCE)',
        subtitle: 'Consents (up to 5 accounts), auto-categorization, simulator and audit trail',
      },
      accounts: {
        section: 'Accounts & Banking Security',
        subtitle: 'Open Finance integration for up to 5 institutions with full audit',
      },
      investments: {
        section: 'Wealth & Investments',
        subtitle: 'Portfolio simulator and yield scenarios',
      },
      assistant: {
        section: 'Friendly Chat & Private Banker',
        subtitle: 'Real-time financial intelligence grounded in your numbers',
      },
      settings: {
        section: 'Settings Center',
        subtitle: 'Language, automated monitoring, grid structure and privacy',
      },
    },
    openMenu: 'Open menu',
    showValuesTitle: 'Show financial values',
    hideValuesTitle: 'Hide financial values',
    hiddenValues: 'Values Hidden',
    hideValues: 'Hide Values',
    toLightTheme: 'Switch to Light Mode',
    toDarkTheme: 'Switch to Dark Mode',
    toggleThemeAria: 'Toggle theme',
    newEntry: 'New Entry',
  },
  settings: {
    languageCardTitle: 'Application Language',
    languageCardSubtitle: 'Switch the interface language immediately. Portuguese is the default native language.',
    languageActiveLabel: 'Active',
    languageSwitchedNotice: 'Language updated to English.',
    subTabs: {
      monitoring: 'Auto Monitoring',
      goals: 'Savings Goals',
      grid: 'Timeline & Grid',
      security: 'Security & Privacy',
    },
    monitoring: {
      syncFrequency: 'Open Finance Sync Frequency',
      every15m: 'Every 15 minutes',
      every30m: 'Every 30 minutes',
      every1h: 'Every 1 hour',
      every6h: 'Every 6 hours',
      anomalySensitivity: 'Spike Detector Sensitivity (% above average)',
      alertsInCenter: 'Alerts in Control Center',
      autoRulesTitle: 'Bank Auto-Categorization Rules',
      autoRulesDesc: 'Keywords detected in bank descriptions are automatically routed to the matching grid row.',
      keywordPlaceholder: 'Keyword (e.g. uber, grocery, pix)',
      addRule: 'Add Rule',
      limitsTitle: 'Category Alert Ceilings (Monthly Cap in BRL)',
      averageLabel: 'Avg',
      noLimitPlaceholder: 'No cap',
      recurringTitle: 'Detected Subscriptions & Recurring Commitments',
      anomaliesTitle: 'Anomalies & Out-of-Pattern Spikes',
      noAnomalies: 'No anomalies or budget ceiling breaches detected.',
    },
    goals: {
      createTitle: 'Create New Savings Goal',
      createDesc: 'Each goal creates a real-time progress bar on the Monthly Grid and Annual PDF Report.',
      titleLabel: 'Goal Title',
      titlePlaceholder: 'e.g. Save R$ 10,000 by December',
      targetLabel: 'Target Amount (R$)',
      deadlineLabel: 'Deadline (Month)',
      baseLabel: 'Tracking Basis',
      baseResult: 'Net Result',
      baseSavings: 'Saved Reserve',
      baseCombined: 'Saved + Net Result',
      createBtn: 'Create Goal',
      monitoredTitle: 'Monitored Goals',
      noGoals: 'No savings goals created yet.',
      removeGoal: 'Remove goal',
      realProgress: 'Real progress',
    },
    grid: {
      closingDay: 'Monthly Closing / Cutoff Day',
      variationDisplay: 'Variation Display',
      varBoth: 'Amount (R$) and Percent (%)',
      varCurrency: 'Amount Only (R$)',
      varPercent: 'Percent Only (%)',
      showZeroMonths: 'Show Zeroed Months (Jan/Feb/Dec)',
      manageRowsTitle: 'Manage Grid Rows (Edit D/XX Days, Reorder, Hide or Add)',
      blockIncome: 'Income',
      blockFixed: 'Fixed Expenses',
      blockVariable: 'Variable Expenses',
      blockSavings: 'Savings Reserve',
      newRowPlaceholder: 'New row name',
      dayPlaceholder: 'Day (1-31)',
      createRowBtn: 'Create Row',
      dayLabel: 'Day:',
      visibleLabel: 'Visible',
      hiddenLabel: 'Unhide',
    },
    security: {
      kycTitle: 'Holder Identity & KYC Verification',
      holderLabel: 'Holder',
      recordLabel: 'Record',
      verified: 'Verified',
      underReview: 'Under Review',
      pending: 'Pending',
      kycConfirmedPrefix: 'Document',
      kycLast4Prefix: 'ending',
      kycConfirmedSuffix: 'and liveness check confirmed.',
      verifiedAt: 'Verified on',
      officialDoc: 'Official Document',
      last4Digits: 'Last 4 Digits',
      validatingDoc: 'Validating document...',
      validateDocBtn: 'Verify Document & Liveness',
      bioTitle: 'Android Native Biometrics & WebAuthn',
      bioActive: 'Active in Vault',
      bioInactive: 'Disabled',
      registeredDevice: 'Registered device:',
      noDeviceLinked: 'No device linked',
      bioReady: 'Biometric authentication is ready on this device.',
      bioReinstallHint: 'This device is not paired yet (e.g. after reinstall). Re-enable below.',
      bioEnableHint: 'Enable to unlock with Android Native Biometrics (BiometricPrompt) or WebAuthn Passkey.',
      reenableBio: 'Re-enable on This Device',
      enableBio: 'Enable Biometrics',
      testBio: 'Test Biometrics',
      disableBio: 'Disable',
      pinTitle: 'Contingency PIN & Session Privacy',
      currentPin: 'Current PIN',
      newPin: 'New PIN',
      confirmPin: 'Confirm',
      updatePinBtn: 'Update Encrypted PIN',
      autoLock: 'Auto-Lock Timeout',
      minutesSuffix: 'minutes',
      hideOnOpen: 'Hide Values on Open',
      lockOnBackground: 'Lock on Minimize or Tab Switch',
      lockOnBackgroundHint: 'Requires PIN or biometrics when returning after minimizing, switching tabs or locking the screen.',
      rememberedCpfLabel: 'Remembered CPF on sign-in screen:',
      noSavedCpf: 'No saved CPF',
      forgetCpf: 'Forget CPF on this device',
      maskCpfOnLogin: 'Mask pre-filled CPF until focused/edited (Privacy)',
      portabilityTitle: 'Portability, Recovery & Operational Data',
      portabilityDesc: 'Your account is persisted in the server vault linked to your CPF. Export .json backups or test reinstall recovery anytime.',
      exportPdfBtn: 'Annual Report (PDF)',
      exportJsonBtn: 'Export Backup (.json)',
      importJsonBtn: 'Import Backup (JSON)',
      simulateReinstallBtn: 'Simulate Reinstall (Clear Cache & Sign Out)',
      loadDemoBtn: 'Load Sample Data (2026)',
      confirmLoadDemoBtn: 'Confirm Load 2026 Sample',
      clearAllBtn: 'Reset All Operational Data',
      confirmClearAllBtn: 'Confirm Reset All',
      cancelBtn: 'Cancel',
      msgJsonOk: 'JSON backup imported and synced to your vault.',
      msgJsonExported: 'JSON backup generated and downloaded safely.',
      msgJsonInvalid: 'Invalid JSON backup structure.',
      msgPinDigits: 'Current and new PIN must be 4 to 6 digits.',
      msgPinMismatch: 'New PIN confirmation does not match.',
      msgPinUpdated: 'PIN updated with cryptographic hash in your vault.',
      msgPinError: 'Failed to update PIN.',
      msgBioLinked: 'Biometrics linked to this device',
      msgBioConfigError: 'Failed to configure biometrics.',
      msgBioMissingLocal: 'Local biometric key not found on this browser. Click Re-enable.',
      msgBioValidated: 'Biometrics verified successfully',
      msgBioTestError: 'Failed to test biometrics.',
      msgBioDisabled: 'Biometrics disabled. PIN access remains active.',
      msgBioDisableError: 'Failed to disable biometrics.',
      msgKycDigits: 'Enter the last 4 digits of your document to complete KYC.',
      msgKycSuccess: 'Identity and liveness verified successfully in your vault.',
      msgKycError: 'Unable to complete KYC verification.',
      msgCpfForgotten: 'Last CPF removed from quick memory on this device.',
      msgDemoLoaded: '2026 sample data loaded into grid, accounts and goals.',
      msgClearedAll: 'All operational data reset to zero (R$ 0.00 / 0 of 5 accounts).',
    },
  },
  matrix: {
    monthInFocus: 'Focus Month · Primary Overview',
    incomeIn: 'Income in',
    incomeSub: 'Inflows and cash balance this month',
    expensesIn: 'Expenses in',
    fixedShort: 'Fixed',
    varShort: 'Var',
    resultOf: 'Net Result',
    surplusSub: 'Monthly surplus available',
    deficitSub: 'Warning: monthly deficit',
    cardInvoices: 'Card Invoices',
    attentionBanner: 'account(s) require consent renewal or official reconnection.',
    checkConnectors: 'Check Connectors',
    openFinanceTitle: 'Open Finance · Credit, Debit & Invoices',
    accountsRatio: 'Accounts',
    paymentDist: 'Spending by Payment Method',
    credit: 'Credit',
    debit: 'Debit',
    pix: 'Pix',
    spotMonth: 'Spot / One-time',
    installmentsMonth: 'Installments',
    remShort: 'Rem.',
    dedupLabel: 'internal transfer(s)/bill payment(s) deduplicated',
    invoicesIn: 'Credit Card Invoices in',
    closingShort: 'Close',
    dueShort: 'Due',
    availLimit: 'Avail. limit',
    ofWord: 'of',
    directFeedTitle: 'Direct Account Feed · Where You Spent',
    directFeedSub: 'Tracking by merchant, connected bank and payment method (Credit / Debit / Pix)',
    filterAll: 'All',
    filterIncome: 'Inflows',
    searchFeedPlaceholder: 'Search merchant, category or bank...',
    noFeedMoves: 'No transactions found for this filter in',
    noDuplicateTag: 'Not double-counted',
    goalsTitle: 'Savings Goals',
    configureGoals: 'Configure Goals in Settings',
    noGoalsDefined: 'No savings goals defined yet.',
    addFirstGoal: 'Add first goal',
    deadlinePrefix: 'Deadline:',
    tracksSavings: 'Tracks Saved Reserve',
    tracksResult: 'Tracks Net Result',
    tracksCombined: 'Tracks Saved + Net Result',
    currentLabel: 'Current:',
    missingPrefix: 'Remaining',
    goalExceeded: 'exceeded',
    annualIncome: 'Annual Total Income',
    annualExpense: 'Annual Total Expenses',
    annualNetResult: 'Annual Net Result',
    annualSaved: 'Total Saved Reserve',
    autoDetectedPrefix: 'Automated monitoring detected',
    autoDetectedSuffix: 'attention event(s)',
    highlightPrefix: 'Highlight:',
    inspectCell: 'Inspect Cell',
    filterCategoryPlaceholder: 'Filter category...',
    hideZeroMonths: 'Hide Zero Months',
    showAll12Months: 'Show All 12 Months',
    downloadPdf: 'Download Annual Report (PDF)',
    addRow: 'Add Row',
    blockLabel: 'Block',
    rowNameLabel: 'Category / Source Name',
    rowNamePlaceholder: 'e.g. FREELANCE or GYM',
    refDayOpt: 'Ref. Day (optional)',
    createRow: 'Create Row',
    cancel: 'Cancel',
    colCategoryRef: 'Category / Reference',
    colConsolidated: 'Consolidated',
    block1Title: 'Block 1 · Income',
    block1Sub: 'Income streams, salaries, extras and cash on hand',
    totalIncome: 'TOTAL (Income)',
    annualGainSub: 'ANNUAL TOTAL INCOME',
    block2Title: 'Block 2 · Fixed Expenses',
    block2Sub: 'Recurring monthly commitments and subscriptions',
    totalFixed: 'TOTAL FIXED',
    block3Title: 'Block 3 · Variable Expenses',
    block3Sub: 'Daily spend, card bills, annual taxes and leisure',
    totalVariable: 'TOTAL VARIABLE',
    totalExpenseRow: 'TOTAL EXPENSES (Fixed + Variable)',
    annualSpendSub: 'ANNUAL TOTAL SPEND',
    resultRow: 'RESULT (Income − Expenses)',
    neutral: 'Neutral',
    surplus: 'Surplus',
    attention: 'Watch',
    deficit: 'Deficit',
    positiveBalance: 'Positive Balance',
    negativeBalance: 'Negative Balance',
    reserveContribution: 'Reserve Contribution',
    totalValueSub: 'TOTAL SAVED',
    footerHint: 'Click any cell or month column header to inspect transactions, bills or switch focus month.',
    activeCategories: 'active categories',
    entriesShort: 'entries',
    moveUp: 'Move up',
    moveDown: 'Move down',
    hideRow: 'Hide row',
  },
  timeline: {
    winMonth: 'Current Month',
    winQuarter: 'Quarter',
    winSemester: 'Semester',
    winYear: 'Full Year',
    winProj12: '6–12m Projection',
    refPrefix: 'Ref.:',
    allAccounts: 'All Accounts',
    manualEntries: 'Manual Entries',
    accountPrefix: 'Account',
    searchPlaceholder: 'Search event...',
    showLabel: 'Show:',
    typeIncome: 'Income',
    typeFixed: 'Fixed Expenses',
    typeVariable: 'Variable Expenses',
    typeCards: 'Cards',
    typeSavings: 'Saved & Investments',
    typeAlerts: 'Alerts',
    chartTitle: 'Projected Balance Over Time',
    chartSub: 'Cumulative trajectory of inflows, due dates and contributions in the filtered window',
    minValley: 'Lowest trough:',
    maxPeak: 'Highest peak:',
    accumBalance: 'Cumulative balance:',
    noEventsFilter: 'No events match the selected filters.',
    noEventsWindow: 'No entries found in the selected window. Adjust filters above to inspect milestones.',
    movementsCount: 'movements',
    installmentWord: 'Installment',
    invoiceDedupTag: 'Bill Payment · Not double-counted',
    internalDedupTag: 'Internal Transfer · Not double-counted',
    alertTag: 'Alert',
    projBalanceShort: 'Proj. bal.:',
  },
  openFinance: {
    title: 'Open Finance Brazil Consent Management',
    connectedSuffix: 'connected accounts',
    subtitle: 'Authorization via OAuth 2.0 + PKCE (FAPI) · TLS 1.3 · Read-only AES-256 tokenization. We never collect bank passwords, PINs, MFA or CVV.',
    tabAll: 'Full Overview',
    tabConsents: 'Accounts & Consents',
    tabSimulator: 'Simulator & Rules',
    tabAudit: 'LGPD Audit Trail',
    connectInstitution: 'Connect New Institution',
    limitReached: '5/5 Accounts Limit Reached',
  },
  accounts: {
    title: 'Connected Accounts (Secure Open Finance)',
    subtitle: 'Up to 5 financial institutions via read-only OAuth 2.0 + PKCE. No bank passwords are stored.',
    connectBank: 'Connect Institution',
    limitReached: '5 Accounts Limit Reached',
  },
  investments: {
    title: 'Yield Simulator & Asset Allocation',
    subtitlePrefix: 'Synced with your current reserve',
    subtitleSuffix: 'and monthly cash-flow capacity',
    profileConservative: 'Conservative',
    profileModerate: 'Moderate',
    profileAggressive: 'Aggressive',
    initialCapital: 'Initial Capital (R$)',
    monthlyContribution: 'Monthly Contribution (R$)',
    termMonths: 'Horizon (months)',
    cdiRate: 'CDI Ref. Rate (% p.a.)',
    ipcaRate: 'Est. Inflation / IPCA (% p.a.)',
    scenarioPrefix: 'Scenario',
    scenarioLabels: {
      conservative: 'Conservative',
      base: 'Base (Recommended)',
      optimistic: 'Optimistic',
    },
    totalContributed: 'Total Contributed:',
    compoundInterest: 'Compound Interest:',
    realReturn: 'Real Return (above IPCA):',
    curveTitle: 'Wealth Growth Curve',
    monthsWord: 'months',
    legendContributed: 'Contributed Capital',
    legendConservative: 'Conservative',
    legendBase: 'Base',
    legendOptimistic: 'Optimistic',
    allocationTitle: 'Suggested Allocation · Profile',
    colAssetClass: 'Asset Class',
    colVehicles: 'Typical Instruments',
    colRole: 'Portfolio Role',
    colAllocation: 'Allocation',
    colInitialValue: 'Initial Value',
    educationalNote: 'Educational notice: The projections and allocation suggestions above are for educational purposes only using simulated reference rates. Past or projected returns do not guarantee future performance and depend on market conditions, taxes and asset liquidity.',
  },
  assistant: {
    integrated: 'Integrated',
    friend: 'Friendly Chat',
    banker: 'Private Banker',
    clearChat: 'Clear Chat',
    emptyTitle: 'Real-Time Advisory Grounded in Your Numbers',
    emptyDesc: 'Switch between the warm tone of Friendly Chat and the strategic precision of Private Banker. Replies read your grid, connected accounts and current reserve.',
    quickPrompts: [
      'Where can I save more this month?',
      'Analyze spot spending, remaining installments & card limits',
      'How much can I invest without tightening cash flow?',
      'Check Open Finance consent health and card bills',
    ],
    loadingText: 'Analyzing your entries and projections in real time...',
    errorTitle: 'Could not retrieve response',
    inputPlaceholder: 'Ask about your expenses, monthly savings or investment plan...',
    offlineError: 'AI Advisor requires an internet connection. Your local financial data remains available offline.',
    contextTitle: 'Live Grounded Context',
    contextSub: 'Synced figures from your Grid CF',
    annualIncome: 'Annual Income',
    annualExpense: 'Annual Expense',
    netResult: 'Net Result',
    totalSaved: 'Total Saved',
    topVariable: 'Top Variable',
    monitoredAlerts: 'Monitored Alerts',
    noActiveAlerts: 'No active alerts right now.',
  },
  modals: {
    newEntryTitle: 'New Entry',
    categoryRowLabel: 'Category / Grid Row',
    groupIncome: 'Income',
    groupFixed: 'Fixed Expenses',
    groupVariable: 'Variable Expenses',
    groupSavings: 'Wealth / Savings',
    monthLabel: 'Month',
    dayLabel: 'Day',
    amountLabel: 'Amount (R$)',
    methodLabel: 'Method',
    accountLabel: 'Bank Account / Card',
    manualAccount: 'Manual / Cash',
    statusLabel: 'Status',
    statusPaid: 'Paid / Received',
    statusPending: 'Pending',
    statusProjected: 'Projected',
    natureLabel: 'Nature',
    natureReal: 'Standard',
    natureInternal: 'Internal Transfer',
    natureInvoice: 'Bill Payment',
    installmentLabel: 'Installment',
    ofTotalLabel: 'Of (Total)',
    merchantLabel: 'Merchant / Where spent',
    merchantPlaceholder: 'e.g. Supermarket, Gas Station, Restaurant...',
    cancel: 'Cancel',
    saveEntry: 'Save Entry',
    cellTotal: 'Cell Total',
    monthlyAvg: 'Monthly Average',
    overLimitTitle: 'Category ceiling exceeded',
    overLimitDesc: 'Configured limit:',
    directEditLabel: 'Direct Consolidated Value Override (R$)',
    applyTotal: 'Apply Total',
    cellEntriesTitle: 'Entries composing this cell',
    noCellEntries: 'No entries recorded for this month yet. Use the form below to add one.',
    addSingleEntryTitle: 'Add Single Entry',
    addEntryToCellBtn: 'Add Entry to Cell',
    notSummedTag: 'Excluded from expense sum',
    dayShort: 'Day',
    lockTitle: 'Protected Session',
    pinInputLabel: 'Access PIN (4–6 digits)',
    unlockBtn: 'Unlock Dashboard',
    validating: 'Validating...',
    unlockWithBio: 'Unlock with',
    waitingBio: 'Waiting for biometrics...',
    endSessionSwitchCpf: 'End Session / Switch CPF',
    bioNativeFooter: 'Android Native Biometrics · CPF Vault',
    bioServerFooter: 'Server cryptographic verification · TLS 1.3',
    offlineBanner: 'Offline Mode — Local vault (IndexedDB) active',
  },
  auth: {
    brandSubtitle: 'CPF-Linked Wealth Vault · KYC & Biometric Authentication',
    stageCpfKicker: 'Holder Identification',
    stageCpfTitle: 'Enter your CPF to sign in or create your vault',
    stageCpfDesc: 'Your data remains linked to your CPF and safely preserved even after app reinstall or browser cleanup.',
    cpfLabel: 'Holder CPF',
    revealCpf: 'Reveal CPF',
    maskCpf: 'Mask CPF',
    clearSwitchCpf: 'Clear / Switch CPF',
    cpfHintEmpty: 'Real check-digit validation (Receita/CPF)',
    cpfDigitsCount: 'digits entered',
    cpfRememberedReady: 'Last CPF remembered · ready to sign in',
    cpfValid: 'Valid CPF',
    cpfInvalidCheck: 'Invalid check digits',
    lastVaultDevice: 'Last vault accessed on this device:',
    quickAccess: 'Quick access (PIN / Biometrics)',
    forgetCpf: 'Forget CPF',
    checkingCpf: 'Checking CPF...',
    continueBtn: 'Continue',
    backChangeCpf: 'Switch CPF',
    pinLabel: 'Access PIN (4–6 digits)',
    enterWithBio: 'Sign In with Biometrics',
    validatingBio: 'Validating biometrics...',
    enterWithPin: 'Sign In with PIN & Restore Account',
    unlockingAccount: 'Unlocking and restoring vault...',
    newRegKicker: 'New Account',
    stepOf3: 'Step',
    step1Title: 'Holder Registration Details',
    step2Title: 'Identity Verification (KYC)',
    step3Title: 'Contingency PIN & Biometrics',
    zeroGridTag: 'Clean First Access (Zeroed Grid)',
    fullNameLabel: 'Full Name *',
    birthDateLabel: 'Date of Birth *',
    phoneLabel: 'Phone (Optional)',
    emailLabel: 'Email (Optional)',
    goToKyc: 'Proceed to Identity Verification',
    kycStatusLabel: 'Current KYC status:',
    officialDocLabel: 'Official Document',
    docLast4Label: 'Last 4 Doc Digits',
    validateDocBtn: 'Run Document & Liveness Verification',
    validatingDocBtn: 'Validating document & liveness...',
    docValidatedBtn: 'Identity & Liveness Verified',
    backBtn: 'Back',
    goToPinBio: 'Proceed to PIN & Biometrics',
    continueLaterKyc: 'Continue (Complete KYC later)',
    regPinLabel: 'Access PIN (4–6 digits) *',
    confirmPinLabel: 'Confirm PIN *',
    enableBioLabel: 'Enable Biometrics on this device',
    zeroStartBanner: 'Clean First Access: your grid starts completely zeroed (R$ 0.00 and 0/5 accounts), ready for your real records.',
    finishCreateBtn: 'Complete Registration & Open Vault',
    creatingVaultBtn: 'Creating Secure Vault...',
    footerSecurity: 'Cryptographically hashed PIN · Persistent recovery by CPF',
  },
  daily: {
    comparison: {
      title: 'Monthly Comparative Summary',
      vsLabel: 'vs',
      income: 'Income',
      expenses: 'Total Expenses',
      netResult: 'Net Balance',
      noPrevMonthData: 'No previous month baseline',
      prevPrefix: 'Prev.:',
    },
    backup: {
      reminderTitle: 'Recent changes without a local JSON backup',
      offlineHint: 'You are operating in local/offline mode — download a .json copy to safeguard your entries.',
      onlineHint: 'Export a .json file after important updates to keep a personal safety copy.',
      lastBackupPrefix: 'Last backup:',
      neverBackedUp: 'No backup exported yet',
      exportBtn: 'Export Backup (.json)',
      dismissBtn: 'Remind later',
    },
    tabs: {
      recurring: 'Recurring Bills',
      limits: 'Category Limits',
      installments: 'Future Installments',
      search: 'Quick Search',
    },
    recurring: {
      title: 'Recurring Bills & Due Alerts',
      subtitle: 'Track fixed monthly bills, due dates and pending items for the month',
      pendingMonthTotal: 'Pending this month',
      overdueAlertSingular: 'overdue bill requires immediate attention',
      overdueAlertPlural: 'overdue bills require immediate attention',
      dueSoonAlert: 'bill(s) due in the next few days',
      addBtn: 'New Recurring Bill',
      titleLabel: 'Bill Description',
      titlePlaceholder: 'e.g. Rent, Power, Internet, Gym',
      amountLabel: 'Amount (R$)',
      dueDayLabel: 'Due Day',
      categoryLabel: 'Category (optional)',
      noCategory: 'Unlinked',
      saveBtn: 'Save Bill',
      cancelBtn: 'Cancel',
      statusPaid: 'Paid',
      statusPending: 'Pending',
      statusOverdue: 'Overdue',
      dueDayShort: 'Due D/',
      dueToday: 'Due today',
      dueInDaysPrefix: 'Due in',
      dueInDaysSuffix: 'd',
      emptyTitle: 'No recurring bills registered yet. Add rent, utilities, internet or subscriptions.',
      deleteTitle: 'Remove recurring bill',
    },
    limits: {
      title: 'Monthly Planning & Category Limits',
      subtitle: 'Set monthly spending ceilings per category and monitor progress',
      overCeilingBadge: 'Over limit',
      nearCeilingBadge: 'Near limit',
      healthyBadge: 'Within budget',
      noLimitBadge: 'No limit set',
      setLimitBtn: 'Set limit',
      editLimitBtn: 'Edit',
      limitPlaceholder: 'Limit (R$)',
      saveBtn: 'Save',
      clearBtn: 'Clear',
      spentOf: 'of',
      remainingPrefix: 'Remaining',
      exceededPrefix: 'Exceeded by',
      emptyCategories: 'No active expense categories found.',
    },
    search: {
      title: 'Quick Entry Search',
      subtitle: 'Instantly filter entries by description, merchant, category, amount or status',
      placeholder: 'Search e.g. grocery, 885, paid, pending, rent...',
      clearBtn: 'Clear',
      resultsSuffix: 'entry(ies)',
      emptyHint: 'Type a keyword or select a quick filter to locate entries in',
      noResults: 'No entries match your search.',
      openCellHint: 'Open cell',
      statusPaid: 'Paid',
      statusPending: 'Pending',
      statusProjected: 'Projected',
    },
    installments: {
      title: 'Future Installments Tracker',
      subtitle: 'Track installment plans, paid vs remaining count and upcoming monthly commitments',
      activePlans: 'Active Plans',
      totalRemaining: 'Total Remaining',
      nextMonthCommitted: 'Next Month Committed',
      paidCountLabel: 'paid',
      remainingCountLabel: 'remaining',
      upcomingTitle: 'Upcoming Months Commitment',
      emptyTitle: 'No installment purchases recorded yet (e.g. 2/10 in New Entry).',
      paidLabel: 'Paid:',
      remainingLabel: 'Remaining:',
      perMonthShort: '/mo',
    },
  },
};

const ES_TRANSLATIONS: AppTranslations = {
  sidebar: {
    subtitle: 'Control · CF 2026+',
    closeMenu: 'Cerrar menú',
    navAria: 'Navegación principal',
    nav: {
      matrix: 'Matriz Mensual',
      timeline: 'Línea de Tiempo',
      openfinance: 'Open Finance',
      accounts: 'Cuentas y Seguridad',
      investments: 'Inversiones',
      assistant: 'Chat y Asesor',
      settings: 'Configuración',
    },
    openFinanceAttention: 'Requiere atención de consentimiento',
    openFinanceActive: 'Consentimientos activos',
    openFinanceEmpty: 'Ninguna institución conectada',
    kycVerified: 'Identidad Verificada',
    kycReview: 'KYC en revisión',
    kycPending: 'KYC pendiente',
    lockSession: 'Bloquear Sesión',
    logoutSwitchCpf: 'Salir / Cambiar CPF',
  },
  topBar: {
    tabs: {
      matrix: {
        section: 'Matriz Financiera Anual',
        subtitle: 'Flujo consolidado de ingresos, gastos fijos, variables y reservas',
      },
      timeline: {
        section: 'Línea de Tiempo y Proyección de Caja',
        subtitle: 'Cronología de vencimientos, ingresos y saldo proyectado',
      },
      openfinance: {
        section: 'Open Finance Brasil (OAuth 2.0 + PKCE)',
        subtitle: 'Consentimientos (hasta 5 cuentas), autocategorización, simulador y auditoría',
      },
      accounts: {
        section: 'Cuentas y Seguridad Bancaria',
        subtitle: 'Integración Open Finance con hasta 5 instituciones y auditoría',
      },
      investments: {
        section: 'Prospección e Inversiones',
        subtitle: 'Simulador patrimonial y escenarios de rentabilidad',
      },
      assistant: {
        section: 'Chat Amigo y Gerente Exclusivo',
        subtitle: 'Inteligencia financiera en tiempo real sobre tus datos',
      },
      settings: {
        section: 'Centro de Configuración',
        subtitle: 'Idioma, monitoreo automático, estructura de la matriz y privacidad',
      },
    },
    openMenu: 'Abrir menú',
    showValuesTitle: 'Mostrar valores financieros',
    hideValuesTitle: 'Ocultar valores financieros',
    hiddenValues: 'Valores Ocultos',
    hideValues: 'Ocultar Valores',
    toLightTheme: 'Cambiar a Modo Claro',
    toDarkTheme: 'Cambiar a Modo Oscuro',
    toggleThemeAria: 'Cambiar tema',
    newEntry: 'Nuevo Movimiento',
  },
  settings: {
    languageCardTitle: 'Idioma de la Aplicación',
    languageCardSubtitle: 'Cambia el idioma de la interfaz de inmediato. El portugués es el idioma nativo predeterminado.',
    languageActiveLabel: 'Activo',
    languageSwitchedNotice: 'Idioma actualizado a Español.',
    subTabs: {
      monitoring: 'Monitoreo Automático',
      goals: 'Metas de Ahorro',
      grid: 'Timeline y Matriz',
      security: 'Seguridad y Privacidad',
    },
    monitoring: {
      syncFrequency: 'Frecuencia de Sincronización Open Finance',
      every15m: 'Cada 15 minutos',
      every30m: 'Cada 30 minutos',
      every1h: 'Cada 1 hora',
      every6h: 'Cada 6 horas',
      anomalySensitivity: 'Sensibilidad del Detector de Picos (% sobre el promedio)',
      alertsInCenter: 'Alertas en la Central',
      autoRulesTitle: 'Reglas de Autocategorización Bancaria',
      autoRulesDesc: 'Las palabras clave detectadas en descripciones bancarias se asignan automáticamente a la fila correspondiente.',
      keywordPlaceholder: 'Palabra clave (ej.: uber, mercado, pix)',
      addRule: 'Agregar Regla',
      limitsTitle: 'Límites de Alerta por Categoría (Tope Mensual en R$)',
      averageLabel: 'Prom.',
      noLimitPlaceholder: 'Sin límite',
      recurringTitle: 'Suscripciones y Compromisos Recurrentes Detectados',
      anomaliesTitle: 'Anomalías y Picos Atípicos',
      noAnomalies: 'No se detectaron anomalías ni excesos de límite por el momento.',
    },
    goals: {
      createTitle: 'Definir Nueva Meta de Ahorro',
      createDesc: 'Cada meta genera automáticamente una barra de progreso en tiempo real en la Matriz Mensual y en el Reporte PDF.',
      titleLabel: 'Título de la Meta',
      titlePlaceholder: 'Ej.: Ahorrar R$ 10.000 hasta Diciembre',
      targetLabel: 'Monto Objetivo (R$)',
      deadlineLabel: 'Plazo (Mes)',
      baseLabel: 'Base de Cálculo',
      baseResult: 'Resultado Neto',
      baseSavings: 'Reserva Guardada',
      baseCombined: 'Guardado + Resultado',
      createBtn: 'Crear Meta',
      monitoredTitle: 'Metas Monitoreadas',
      noGoals: 'Aún no hay metas registradas.',
      removeGoal: 'Eliminar meta',
      realProgress: 'Progreso real',
    },
    grid: {
      closingDay: 'Día de Cierre / Corte del Mes',
      variationDisplay: 'Visualización de Variaciones',
      varBoth: 'Monto (R$) y Porcentaje (%)',
      varCurrency: 'Solo Monto (R$)',
      varPercent: 'Solo Porcentaje (%)',
      showZeroMonths: 'Mostrar Meses en Cero (Ene/Feb/Dic)',
      manageRowsTitle: 'Gestionar Filas de la Matriz (Editar Días D/XX, Reordenar, Ocultar o Crear)',
      blockIncome: 'Ingresos',
      blockFixed: 'Gastos Fijos',
      blockVariable: 'Gastos Variables',
      blockSavings: 'Reserva',
      newRowPlaceholder: 'Nombre de la nueva fila',
      dayPlaceholder: 'Día (1-31)',
      createRowBtn: 'Crear Fila',
      dayLabel: 'Día:',
      visibleLabel: 'Visible',
      hiddenLabel: 'Mostrar',
    },
    security: {
      kycTitle: 'Identidad del Titular y Verificación KYC',
      holderLabel: 'Titular',
      recordLabel: 'Registro',
      verified: 'Verificado',
      underReview: 'En revisión',
      pending: 'Pendiente',
      kycConfirmedPrefix: 'Documento',
      kycLast4Prefix: 'terminación',
      kycConfirmedSuffix: 'y prueba de vida confirmados.',
      verifiedAt: 'Verificado el',
      officialDoc: 'Documento Oficial',
      last4Digits: 'Últimos 4 Dígitos',
      validatingDoc: 'Validando documento...',
      validateDocBtn: 'Validar Documento y Prueba de Vida',
      bioTitle: 'Biometría Nativa Android y WebAuthn',
      bioActive: 'Activa en la Bóveda',
      bioInactive: 'Desactivada',
      registeredDevice: 'Dispositivo registrado:',
      noDeviceLinked: 'Ningún dispositivo vinculado',
      bioReady: 'Autenticación biométrica lista en este dispositivo.',
      bioReinstallHint: 'Este dispositivo aún no está vinculado (ej. tras reinstalar). Reactiva abajo.',
      bioEnableHint: 'Actívala para desbloquear con Biometría Nativa Android (BiometricPrompt) o Passkey WebAuthn.',
      reenableBio: 'Reactivar en este Dispositivo',
      enableBio: 'Activar Biometría',
      testBio: 'Probar Biometría',
      disableBio: 'Desactivar',
      pinTitle: 'PIN de Contingencia y Privacidad de Sesión',
      currentPin: 'PIN Actual',
      newPin: 'Nuevo PIN',
      confirmPin: 'Confirmar',
      updatePinBtn: 'Actualizar PIN Cifrado',
      autoLock: 'Bloqueo Automático',
      minutesSuffix: 'minutos',
      hideOnOpen: 'Ocultar Valores al Abrir',
      lockOnBackground: 'Bloquear al Minimizar o Cambiar de Pestaña',
      lockOnBackgroundHint: 'Exige PIN o biometría al volver tras minimizar la app, cambiar de pestaña o bloquear la pantalla.',
      rememberedCpfLabel: 'Memoria del último CPF en la identificación:',
      noSavedCpf: 'Ningún CPF guardado',
      forgetCpf: 'Olvidar CPF en este dispositivo',
      maskCpfOnLogin: 'Ocultar dígitos del CPF prellenado hasta enfocar/editar (Privacidad)',
      portabilityTitle: 'Portabilidad, Recuperación y Datos Operativos',
      portabilityDesc: 'Tu cuenta se guarda en la bóveda persistente del servidor vinculada a tu CPF. Exporta respaldos .json o prueba la recuperación cuando lo desees.',
      exportPdfBtn: 'Reporte Anual (PDF)',
      exportJsonBtn: 'Exportar Respaldo (.json)',
      importJsonBtn: 'Importar Respaldo (JSON)',
      simulateReinstallBtn: 'Simular Reinstalación (Limpiar Caché y Salir)',
      loadDemoBtn: 'Cargar Datos de Ejemplo (2026)',
      confirmLoadDemoBtn: 'Confirmar Carga Ejemplo 2026',
      clearAllBtn: 'Reiniciar Todos los Datos Operativos',
      confirmClearAllBtn: 'Confirmar Reinicio Total',
      cancelBtn: 'Cancelar',
      msgJsonOk: 'Respaldo JSON importado y sincronizado con tu bóveda.',
      msgJsonExported: 'Respaldo JSON generado y descargado con éxito.',
      msgJsonInvalid: 'Estructura de archivo JSON inválida.',
      msgPinDigits: 'El PIN actual y el nuevo PIN deben tener de 4 a 6 dígitos.',
      msgPinMismatch: 'La confirmación del nuevo PIN no coincide.',
      msgPinUpdated: 'PIN actualizado con hash criptográfico en tu bóveda.',
      msgPinError: 'Error al actualizar el PIN.',
      msgBioLinked: 'Biometría vinculada a este dispositivo',
      msgBioConfigError: 'Error al configurar la biometría.',
      msgBioMissingLocal: 'Clave biométrica local no encontrada en este navegador. Pulsa Reactivar.',
      msgBioValidated: 'Biometría validada con éxito',
      msgBioTestError: 'Error al probar la biometría.',
      msgBioDisabled: 'Biometría desactivada. Acceso mantenido con PIN.',
      msgBioDisableError: 'Error al desactivar la biometría.',
      msgKycDigits: 'Ingresa los últimos 4 dígitos del documento para completar el KYC.',
      msgKycSuccess: 'Identidad y prueba de vida verificadas con éxito en tu bóveda.',
      msgKycError: 'No se pudo completar la verificación KYC.',
      msgCpfForgotten: 'Último CPF eliminado de la memoria rápida de este dispositivo.',
      msgDemoLoaded: 'Datos de ejemplo 2026 cargados en la matriz, cuentas y metas.',
      msgClearedAll: 'Todos los datos operativos fueron reiniciados (R$ 0,00 / 0 de 5 cuentas).',
    },
  },
  matrix: {
    monthInFocus: 'Mes en Foco · Vista Principal',
    incomeIn: 'Ingresos en',
    incomeSub: 'Entradas y saldo de caja del mes',
    expensesIn: 'Gastos en',
    fixedShort: 'Fijos',
    varShort: 'Var',
    resultOf: 'Resultado de',
    surplusSub: 'Superávit disponible del mes',
    deficitSub: 'Atención: déficit en el mes',
    cardInvoices: 'Facturas de Tarjeta',
    attentionBanner: 'cuenta(s) requieren renovación de consentimiento o reconexión oficial.',
    checkConnectors: 'Verificar Conectores',
    openFinanceTitle: 'Open Finance · Crédito, Débito y Facturas',
    accountsRatio: 'Cuentas',
    paymentDist: 'Distribución por Medio de Pago',
    credit: 'Crédito',
    debit: 'Débito',
    pix: 'Pix',
    spotMonth: 'Al Contado en el Mes',
    installmentsMonth: 'En Cuotas',
    remShort: 'Rest.',
    dedupLabel: 'transf. interna(s)/pago(s) de factura deduplicados',
    invoicesIn: 'Facturas de Tarjeta de Crédito en',
    closingShort: 'Cierre',
    dueShort: 'Venc.',
    availLimit: 'Lím. disp.',
    ofWord: 'de',
    directFeedTitle: 'Extracto Directo de Cuentas · Dónde se Gastó',
    directFeedSub: 'Seguimiento por comercio, banco conectado y modalidad (Crédito / Débito / Pix)',
    filterAll: 'Todos',
    filterIncome: 'Ingresos',
    searchFeedPlaceholder: 'Buscar comercio, categoría o banco...',
    noFeedMoves: 'No se encontraron movimientos para este filtro en',
    noDuplicateTag: 'No duplica gasto',
    goalsTitle: 'Metas de Ahorro',
    configureGoals: 'Configurar Metas en Ajustes',
    noGoalsDefined: 'No hay metas de ahorro definidas.',
    addFirstGoal: 'Agregar primera meta',
    deadlinePrefix: 'Plazo:',
    tracksSavings: 'Sigue Reserva Guardada',
    tracksResult: 'Sigue Resultado Neto',
    tracksCombined: 'Sigue Guardado + Resultado',
    currentLabel: 'Actual:',
    missingPrefix: 'Faltan',
    goalExceeded: 'superada',
    annualIncome: 'Ingreso Total Anual',
    annualExpense: 'Gasto Total Anual',
    annualNetResult: 'Resultado Neto Anual',
    annualSaved: 'Total Guardado',
    autoDetectedPrefix: 'El monitoreo automático detectó',
    autoDetectedSuffix: 'evento(s) de atención',
    highlightPrefix: 'Destacado:',
    inspectCell: 'Inspeccionar Celda',
    filterCategoryPlaceholder: 'Filtrar categoría...',
    hideZeroMonths: 'Ocultar Meses en Cero',
    showAll12Months: 'Mostrar los 12 Meses',
    downloadPdf: 'Descargar Reporte Anual (PDF)',
    addRow: 'Agregar Fila',
    blockLabel: 'Bloque',
    rowNameLabel: 'Nombre de Categoría / Fuente',
    rowNamePlaceholder: 'Ej.: FREELANCE o GIMNASIO',
    refDayOpt: 'Día Ref. (opcional)',
    createRow: 'Crear Fila',
    cancel: 'Cancelar',
    colCategoryRef: 'Categoría / Referencia',
    colConsolidated: 'Consolidado',
    block1Title: 'Bloque 1 · Ingresos',
    block1Sub: 'Fuentes de ingreso, salarios, extras y caja disponible',
    totalIncome: 'TOTAL (Ingresos)',
    annualGainSub: 'INGRESO TOTAL ANUAL',
    block2Title: 'Bloque 2 · Gastos Fijos',
    block2Sub: 'Compromisos mensuales recurrentes y suscripciones',
    totalFixed: 'TOTAL FIJOS',
    block3Title: 'Bloque 3 · Gastos Variables',
    block3Sub: 'Consumo, facturas de tarjeta, impuestos anuales y ocio',
    totalVariable: 'TOTAL VARIABLES',
    totalExpenseRow: 'TOTAL DE GASTO (Fijos + Variables)',
    annualSpendSub: 'GASTO TOTAL ANUAL',
    resultRow: 'RESULTADO (Ingresos − Gastos)',
    neutral: 'Neutro',
    surplus: 'Superávit',
    attention: 'Atención',
    deficit: 'Déficit',
    positiveBalance: 'Saldo Positivo',
    negativeBalance: 'Saldo Negativo',
    reserveContribution: 'Aporte Reserva',
    totalValueSub: 'VALOR TOTAL',
    footerHint: 'Haz clic en cualquier celda o columna de mes para detallar movimientos, facturas o cambiar el mes en foco.',
    activeCategories: 'categorías activas',
    entriesShort: 'mov.',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    hideRow: 'Ocultar fila',
  },
  timeline: {
    winMonth: 'Mes Actual',
    winQuarter: 'Trimestre',
    winSemester: 'Semestre',
    winYear: 'Año Completo',
    winProj12: 'Proyección 6–12m',
    refPrefix: 'Ref.:',
    allAccounts: 'Todas las Cuentas',
    manualEntries: 'Registros Manuales',
    accountPrefix: 'Cuenta',
    searchPlaceholder: 'Buscar evento...',
    showLabel: 'Mostrar:',
    typeIncome: 'Ingresos',
    typeFixed: 'Gastos Fijos',
    typeVariable: 'Gastos Variables',
    typeCards: 'Tarjetas',
    typeSavings: 'Guardado e Inversiones',
    typeAlerts: 'Alertas',
    chartTitle: 'Saldo Proyectado a lo Largo del Tiempo',
    chartSub: 'Evolución acumulada entre ingresos, vencimientos y aportes en el período filtrado',
    minValley: 'Valle mínimo:',
    maxPeak: 'Pico máximo:',
    accumBalance: 'Saldo acumulado:',
    noEventsFilter: 'Ningún evento coincide con los filtros seleccionados.',
    noEventsWindow: 'No se encontraron movimientos en la ventana seleccionada. Ajusta los filtros para visualizar.',
    movementsCount: 'movimientos',
    installmentWord: 'Cuota',
    invoiceDedupTag: 'Pago Factura · No duplica gasto',
    internalDedupTag: 'Transf. Interna · No duplica',
    alertTag: 'Alerta',
    projBalanceShort: 'Saldo proy.:',
  },
  openFinance: {
    title: 'Gestión de Consentimientos Open Finance Brasil',
    connectedSuffix: 'cuentas conectadas',
    subtitle: 'Autorización vía OAuth 2.0 + PKCE (FAPI) · TLS 1.3 · Tokenización AES-256 solo lectura. Nunca solicitamos contraseñas bancarias, PINs, MFA o CVV.',
    tabAll: 'Vista Completa',
    tabConsents: 'Cuentas y Consentimientos',
    tabSimulator: 'Simulador y Reglas',
    tabAudit: 'Auditoría LGPD',
    connectInstitution: 'Conectar Nueva Institución',
    limitReached: 'Límite de 5/5 Cuentas Alcanzado',
  },
  accounts: {
    title: 'Cuentas Conectadas (Open Finance Seguro)',
    subtitle: 'Hasta 5 instituciones financieras vía OAuth 2.0 + PKCE solo lectura. Ninguna contraseña bancaria es almacenada.',
    connectBank: 'Conectar Institución',
    limitReached: 'Límite de 5 Cuentas Alcanzado',
  },
  investments: {
    title: 'Simulador de Rentabilidad y Asignación Patrimonial',
    subtitlePrefix: 'Base sincronizada con tu reserva actual',
    subtitleSuffix: 'y capacidad mensual de flujo',
    profileConservative: 'Conservador',
    profileModerate: 'Moderado',
    profileAggressive: 'Arriesgado',
    initialCapital: 'Capital Inicial (R$)',
    monthlyContribution: 'Aporte Mensual (R$)',
    termMonths: 'Plazo (meses)',
    cdiRate: 'Tasa CDI Ref. (% anual)',
    ipcaRate: 'Inflación / IPCA Est. (% anual)',
    scenarioPrefix: 'Escenario',
    scenarioLabels: {
      conservative: 'Conservador',
      base: 'Base (Recomendado)',
      optimistic: 'Optimista',
    },
    totalContributed: 'Total Aportado:',
    compoundInterest: 'Interés Compuesto:',
    realReturn: 'Retorno Real (sobre IPCA):',
    curveTitle: 'Curva de Evolución Patrimonial',
    monthsWord: 'meses',
    legendContributed: 'Capital Aportado',
    legendConservative: 'Conservador',
    legendBase: 'Base',
    legendOptimistic: 'Optimista',
    allocationTitle: 'Sugerencia de Asignación · Perfil',
    colAssetClass: 'Clase de Activo',
    colVehicles: 'Instrumentos Típicos',
    colRole: 'Función en Cartera',
    colAllocation: 'Asignación',
    colInitialValue: 'Valor Inicial',
    educationalNote: 'Nota educativa: Las proyecciones y sugerencias de asignación anteriores tienen carácter exclusivamente educativo con tasas de referencia simuladas. La rentabilidad pasada o proyectada no garantiza retornos futuros y depende del mercado, impuestos y liquidez.',
  },
  assistant: {
    integrated: 'Integrado',
    friend: 'Chat Amigo',
    banker: 'Gerente Exclusivo',
    clearChat: 'Limpiar Chat',
    emptyTitle: 'Asesoría en Tiempo Real sobre tus Números',
    emptyDesc: 'Alterna entre el tono cercano de Chat Amigo y la precisión estratégica del Gerente Bancario Exclusivo. Las respuestas leen tu matriz, cuentas conectadas y reserva actual.',
    quickPrompts: [
      '¿Dónde puedo ahorrar más este mes?',
      'Analizar contado, cuotas restantes y límites de tarjetas',
      '¿Cuánto puedo invertir sin apretar mi flujo de caja?',
      'Revisar salud de consentimientos Open Finance y facturas',
    ],
    loadingText: 'Analizando tus movimientos y proyecciones en tiempo real...',
    errorTitle: 'No se pudo obtener respuesta',
    inputPlaceholder: 'Pregunta sobre tus gastos, ahorro mensual o dónde invertir...',
    offlineError: 'El Asesor IA requiere conexión a internet. Tus datos financieros locales siguen disponibles sin conexión.',
    contextTitle: 'Contexto Leído en Tiempo Real',
    contextSub: 'Cifras sincronizadas de tu Matriz CF',
    annualIncome: 'Ingreso Anual',
    annualExpense: 'Gasto Anual',
    netResult: 'Resultado Neto',
    totalSaved: 'Total Guardado',
    topVariable: 'Mayor Variable',
    monitoredAlerts: 'Alertas Monitoreadas',
    noActiveAlerts: 'No hay alertas activas por el momento.',
  },
  modals: {
    newEntryTitle: 'Nuevo Movimiento',
    categoryRowLabel: 'Categoría / Fila de la Matriz',
    groupIncome: 'Ingresos',
    groupFixed: 'Gastos Fijos',
    groupVariable: 'Gastos Variables',
    groupSavings: 'Patrimonio / Guardado',
    monthLabel: 'Mes',
    dayLabel: 'Día',
    amountLabel: 'Monto (R$)',
    methodLabel: 'Modalidad',
    accountLabel: 'Cuenta Bancaria / Tarjeta',
    manualAccount: 'Manual / Efectivo',
    statusLabel: 'Estado',
    statusPaid: 'Pagado / Recibido',
    statusPending: 'Pendiente',
    statusProjected: 'Proyectado',
    natureLabel: 'Naturaleza',
    natureReal: 'Real',
    natureInternal: 'Transf. Interna',
    natureInvoice: 'Pago Factura',
    installmentLabel: 'Cuota',
    ofTotalLabel: 'De (Total)',
    merchantLabel: 'Comercio / Dónde se gastó',
    merchantPlaceholder: 'Ej.: Supermercado, Gasolinera, Restaurante...',
    cancel: 'Cancelar',
    saveEntry: 'Guardar Movimiento',
    cellTotal: 'Total de la Celda',
    monthlyAvg: 'Promedio Mensual',
    overLimitTitle: 'Límite de categoría superado',
    overLimitDesc: 'Límite configurado en',
    directEditLabel: 'Edición Directa del Total Consolidado (R$)',
    applyTotal: 'Aplicar Total',
    cellEntriesTitle: 'Movimientos que componen esta celda',
    noCellEntries: 'No hay movimientos registrados en este mes. Usa el formulario abajo para agregar.',
    addSingleEntryTitle: 'Agregar Nuevo Movimiento Puntual',
    addEntryToCellBtn: 'Agregar Movimiento a la Celda',
    notSummedTag: 'No sumado al gasto',
    dayShort: 'Día',
    lockTitle: 'Sesión Protegida',
    pinInputLabel: 'PIN de Acceso (4–6 dígitos)',
    unlockBtn: 'Desbloquear Panel',
    validating: 'Validando...',
    unlockWithBio: 'Desbloquear con',
    waitingBio: 'Esperando biometría...',
    endSessionSwitchCpf: 'Cerrar Sesión / Cambiar CPF',
    bioNativeFooter: 'Biometría Nativa Android · Bóveda por CPF',
    bioServerFooter: 'Validación criptográfica en servidor · TLS 1.3',
    offlineBanner: 'Modo Sin Conexión — Bóveda local (IndexedDB) activa',
  },
  auth: {
    brandSubtitle: 'Bóveda Patrimonial Vinculada al CPF · KYC y Autenticación Biométrica',
    stageCpfKicker: 'Identificación del Titular',
    stageCpfTitle: 'Ingresa tu CPF para acceder o crear tu bóveda',
    stageCpfDesc: 'Tus datos quedan vinculados al CPF y preservados con seguridad incluso tras desinstalar o limpiar el navegador.',
    cpfLabel: 'CPF del Titular',
    revealCpf: 'Mostrar CPF',
    maskCpf: 'Ocultar CPF',
    clearSwitchCpf: 'Limpiar / Cambiar CPF',
    cpfHintEmpty: 'Validación real de dígitos verificadores (Receita/CPF)',
    cpfDigitsCount: 'dígitos ingresados',
    cpfRememberedReady: 'Último CPF recordado · listo para autenticar',
    cpfValid: 'CPF válido',
    cpfInvalidCheck: 'Dígitos verificadores inválidos',
    lastVaultDevice: 'Última bóveda accedida en este dispositivo:',
    quickAccess: 'Acceso rápido (PIN / Biometría)',
    forgetCpf: 'Olvidar CPF',
    checkingCpf: 'Verificando CPF...',
    continueBtn: 'Continuar',
    backChangeCpf: 'Cambiar CPF',
    pinLabel: 'PIN de Acceso (4–6 dígitos)',
    enterWithBio: 'Entrar con Biometría',
    validatingBio: 'Validando biometría...',
    enterWithPin: 'Entrar con PIN y Restaurar Cuenta',
    unlockingAccount: 'Desbloqueando y restaurando bóveda...',
    newRegKicker: 'Nuevo Registro',
    stepOf3: 'Paso',
    step1Title: 'Datos de Registro del Titular',
    step2Title: 'Verificación de Identidad (KYC)',
    step3Title: 'PIN de Contingencia y Biometría',
    zeroGridTag: 'Primer Acceso Real (Matriz en Cero)',
    fullNameLabel: 'Nombre Completo *',
    birthDateLabel: 'Fecha de Nacimiento *',
    phoneLabel: 'Teléfono (Opcional)',
    emailLabel: 'Correo Electrónico (Opcional)',
    goToKyc: 'Avanzar a Verificación de Identidad',
    kycStatusLabel: 'Estado actual de KYC:',
    officialDocLabel: 'Documento Oficial',
    docLast4Label: 'Últimos 4 Dígitos del Doc.',
    validateDocBtn: 'Ejecutar Validación Documental y Prueba de Vida',
    validatingDocBtn: 'Validando documento y prueba de vida...',
    docValidatedBtn: 'Identidad y Prueba de Vida Verificadas',
    backBtn: 'Volver',
    goToPinBio: 'Avanzar a PIN y Biometría',
    continueLaterKyc: 'Continuar (Completar KYC después)',
    regPinLabel: 'PIN de Acceso (4–6 dígitos) *',
    confirmPinLabel: 'Confirmar PIN *',
    enableBioLabel: 'Activar Biometría en este dispositivo',
    zeroStartBanner: 'Primer Acceso Real: tu matriz iniciará totalmente en cero (R$ 0,00 y 0/5 cuentas), lista para tus registros reales.',
    finishCreateBtn: 'Completar Registro y Acceder',
    creatingVaultBtn: 'Creando Bóveda Segura...',
    footerSecurity: 'PIN protegido con hash criptográfico · Recuperación persistente por CPF',
  },
  daily: {
    comparison: {
      title: 'Resumen Mensual Comparativo',
      vsLabel: 'vs',
      income: 'Ingresos',
      expenses: 'Gastos Totales',
      netResult: 'Saldo Neto',
      noPrevMonthData: 'Sin base del mes anterior',
      prevPrefix: 'Ant.:',
    },
    backup: {
      reminderTitle: 'Hay cambios recientes sin respaldo JSON local',
      offlineHint: 'Estás operando en modo local/offline — descarga una copia .json para proteger tus registros.',
      onlineHint: 'Recomendamos exportar un archivo .json tras actualizaciones importantes como copia de seguridad.',
      lastBackupPrefix: 'Último respaldo:',
      neverBackedUp: 'Ningún respaldo exportado aún',
      exportBtn: 'Exportar Respaldo (.json)',
      dismissBtn: 'Recordar luego',
    },
    tabs: {
      recurring: 'Cuentas Recurrentes',
      limits: 'Límites por Categoría',
      installments: 'Cuotas Futuras',
      search: 'Búsqueda Rápida',
    },
    recurring: {
      title: 'Cuentas Recurrentes y Vencimientos',
      subtitle: 'Controla cuentas fijas mensuales, fechas de vencimiento y pendientes del mes',
      pendingMonthTotal: 'Pendiente en el mes',
      overdueAlertSingular: 'cuenta atrasada requiere atención inmediata',
      overdueAlertPlural: 'cuentas atrasadas requieren atención inmediata',
      dueSoonAlert: 'cuenta(s) por vencer en los próximos días',
      addBtn: 'Nueva Cuenta Fija',
      titleLabel: 'Descripción de la Cuenta',
      titlePlaceholder: 'Ej.: Alquiler, Luz, Internet, Gimnasio',
      amountLabel: 'Monto (R$)',
      dueDayLabel: 'Día Venc.',
      categoryLabel: 'Categoría (opcional)',
      noCategory: 'Sin vínculo en matriz',
      saveBtn: 'Guardar Cuenta',
      cancelBtn: 'Cancelar',
      statusPaid: 'Pagado',
      statusPending: 'Pendiente',
      statusOverdue: 'Atrasado',
      dueDayShort: 'Venc. D/',
      dueToday: 'Vence hoy',
      dueInDaysPrefix: 'Vence en',
      dueInDaysSuffix: 'd',
      emptyTitle: 'Aún no hay cuentas recurrentes registradas. Agrega alquiler, servicios o suscripciones.',
      deleteTitle: 'Eliminar cuenta recurrente',
    },
    limits: {
      title: 'Planificación y Límites por Categoría',
      subtitle: 'Define topes mensuales de gasto y monitorea el avance en tiempo real',
      overCeilingBadge: 'Sobre el límite',
      nearCeilingBadge: 'Cerca del límite',
      healthyBadge: 'Dentro del tope',
      noLimitBadge: 'Sin límite definido',
      setLimitBtn: 'Definir límite',
      editLimitBtn: 'Editar',
      limitPlaceholder: 'Límite (R$)',
      saveBtn: 'Guardar',
      clearBtn: 'Quitar',
      spentOf: 'de',
      remainingPrefix: 'Restan',
      exceededPrefix: 'Excedido en',
      emptyCategories: 'No se encontraron categorías de gasto activas.',
    },
    search: {
      title: 'Búsqueda Rápida de Movimientos',
      subtitle: 'Filtra al instante por descripción, comercio, categoría, monto o estado',
      placeholder: 'Buscar ej.: mercado, 885, pagado, pendiente, alquiler...',
      clearBtn: 'Limpiar',
      resultsSuffix: 'movimiento(s)',
      emptyHint: 'Escribe un término o elige un filtro rápido para ubicar movimientos en',
      noResults: 'No se encontraron movimientos para esta búsqueda.',
      openCellHint: 'Abrir celda',
      statusPaid: 'Pagado',
      statusPending: 'Pendiente',
      statusProjected: 'Proyectado',
    },
    installments: {
      title: 'Control de Cuotas Futuras',
      subtitle: 'Monitorea compras en cuotas, cuotas pagadas, restantes y compromiso futuro',
      activePlans: 'Planes Activos',
      totalRemaining: 'Saldo Total por Pagar',
      nextMonthCommitted: 'Comprometido Próx. Mes',
      paidCountLabel: 'pagadas',
      remainingCountLabel: 'restantes',
      upcomingTitle: 'Proyección de Próximos Meses',
      emptyTitle: 'Aún no hay compras en cuotas registradas (ej.: 2/10 en Nuevo Movimiento).',
      paidLabel: 'Pagadas:',
      remainingLabel: 'Restantes:',
      perMonthShort: '/mes',
    },
  },
};

const TRANSLATIONS: Record<AppLanguage, AppTranslations> = {
  pt: PT_TRANSLATIONS,
  en: EN_TRANSLATIONS,
  es: ES_TRANSLATIONS,
};

export function getTranslations(lang?: AppLanguage): AppTranslations {
  return TRANSLATIONS[normalizeLanguage(lang)];
}
