import { resolveText } from './resolve'

/**
 * Runtime UI-string catalogue for OPERATOR-FACING widget chrome (labels,
 * dialogs, messages) that isn't designer-configurable and therefore can't use
 * the per-widget multilingual props. Each entry maps a key to a { code: text }
 * map covering the 7 catalogue languages; `t()` resolves it for the active
 * language with the usual fallback (active → default → first available).
 *
 * Use for static text inside runtime widgets (e.g. dialogs, status toasts). The
 * edit/designer app stays English-only and does NOT use this — see the
 * edit-app-english guideline.
 *
 * Interpolation: put {name} placeholders in the strings and pass a `vars`
 * object, e.g. t('valueWritten', lang, def, { addr: 'MAIN.x', val: 1 }).
 */
export const UI = {
  // Widget default labels (used only when the designer left the prop empty)
  close:           { it: 'Chiudi', en: 'Close', fr: 'Fermer', de: 'Schließen', es: 'Cerrar', pt: 'Fechar', ru: 'Закрыть' },

  // Credential prompt (group model — {need} is the required GROUP name)
  protectedOperation: { it: 'Operazione protetta', en: 'Protected operation', fr: 'Opération protégée', de: 'Geschützter Vorgang', es: 'Operación protegida', pt: 'Operação protegida', ru: 'Защищённая операция' },
  protectedParameter: { it: 'Parametro protetto', en: 'Protected parameter', fr: 'Paramètre protégé', de: 'Geschützter Parameter', es: 'Parámetro protegido', pt: 'Parâmetro protegido', ru: 'Защищённый параметр' },
  enterCredentials:   { it: 'Inserisci le credenziali. Gruppo richiesto: {need}.', en: 'Enter your credentials. Required group: {need}.', fr: 'Saisissez vos identifiants. Groupe requis : {need}.', de: 'Anmeldedaten eingeben. Erforderliche Gruppe: {need}.', es: 'Introduce las credenciales. Grupo requerido: {need}.', pt: 'Introduza as credenciais. Grupo necessário: {need}.', ru: 'Введите учётные данные. Требуемая группа: {need}.' },
  enterCredentialsParam: { it: 'Inserisci le credenziali per modificare questo parametro.', en: 'Enter your credentials to change this parameter.', fr: 'Saisissez vos identifiants pour modifier ce paramètre.', de: 'Anmeldedaten eingeben, um diesen Parameter zu ändern.', es: 'Introduce las credenciales para modificar este parámetro.', pt: 'Introduza as credenciais para alterar este parâmetro.', ru: 'Введите учётные данные для изменения этого параметра.' },
  insufficientLevel:  { it: 'Permessi insufficienti (gruppo richiesto: {need}).', en: 'Insufficient permissions (required group: {need}).', fr: 'Autorisations insuffisantes (groupe requis : {need}).', de: 'Unzureichende Berechtigungen (erforderliche Gruppe: {need}).', es: 'Permisos insuficientes (grupo requerido: {need}).', pt: 'Permissões insuficientes (grupo necessário: {need}).', ru: 'Недостаточно прав (требуемая группа: {need}).' },
  invalidCredentials: { it: 'Credenziali non valide.', en: 'Invalid credentials.', fr: 'Identifiants invalides.', de: 'Ungültige Anmeldedaten.', es: 'Credenciales no válidas.', pt: 'Credenciais inválidas.', ru: 'Неверные учётные данные.' },
  passwordExpired:    { it: 'La password è scaduta e deve essere cambiata prima di continuare.', en: 'Your password has expired and must be changed before you can continue.', fr: 'Votre mot de passe a expiré et doit être changé avant de continuer.', de: 'Ihr Passwort ist abgelaufen und muss geändert werden, bevor Sie fortfahren können.', es: 'Tu contraseña ha caducado y debe cambiarse antes de continuar.', pt: 'A sua palavra-passe expirou e deve ser alterada antes de continuar.', ru: 'Срок действия пароля истёк, и его необходимо изменить, прежде чем продолжить.' },
  newPassword:        { it: 'Nuova password', en: 'New password', fr: 'Nouveau mot de passe', de: 'Neues Passwort', es: 'Nueva contraseña', pt: 'Nova palavra-passe', ru: 'Новый пароль' },
  confirmNewPassword: { it: 'Conferma nuova password', en: 'Confirm new password', fr: 'Confirmer le nouveau mot de passe', de: 'Neues Passwort bestätigen', es: 'Confirmar nueva contraseña', pt: 'Confirmar nova palavra-passe', ru: 'Подтвердите новый пароль' },
  enterNewPassword:   { it: 'Inserisci la nuova password', en: 'Enter the new password', fr: 'Saisissez le nouveau mot de passe', de: 'Neues Passwort eingeben', es: 'Introduce la nueva contraseña', pt: 'Introduza a nova palavra-passe', ru: 'Введите новый пароль' },
  confirmNewPasswordMsg: { it: 'Conferma la nuova password', en: 'Confirm the new password', fr: 'Confirmez le nouveau mot de passe', de: 'Neues Passwort bestätigen', es: 'Confirma la nueva contraseña', pt: 'Confirme a nova palavra-passe', ru: 'Подтвердите новый пароль' },
  passwordsDoNotMatch: { it: 'Le nuove password non coincidono.', en: 'The new passwords do not match.', fr: 'Les nouveaux mots de passe ne correspondent pas.', de: 'Die neuen Passwörter stimmen nicht überein.', es: 'Las nuevas contraseñas no coinciden.', pt: 'As novas palavras-passe não coincidem.', ru: 'Новые пароли не совпадают.' },
  passwordChanged:    { it: 'Password cambiata.', en: 'Password changed.', fr: 'Mot de passe changé.', de: 'Passwort geändert.', es: 'Contraseña cambiada.', pt: 'Palavra-passe alterada.', ru: 'Пароль изменён.' },
  changePasswordTitle: { it: 'Password scaduta', en: 'Your password has expired', fr: 'Mot de passe expiré', de: 'Passwort abgelaufen', es: 'Contraseña caducada', pt: 'Palavra-passe expirada', ru: 'Срок действия пароля истёк' },
  changeAndContinue:  { it: 'Cambia password e continua', en: 'Change password & continue', fr: 'Changer le mot de passe et continuer', de: 'Passwort ändern und fortfahren', es: 'Cambiar contraseña y continuar', pt: 'Alterar palavra-passe e continuar', ru: 'Изменить пароль и продолжить' },
  login:           { it: 'Accedi', en: 'Log in', fr: 'Connexion', de: 'Anmelden', es: 'Iniciar sesión', pt: 'Iniciar sessão', ru: 'Вход' },
  loginPromptMsg:  { it: 'Inserisci le credenziali per accedere.', en: 'Enter your credentials to log in.', fr: 'Saisissez vos identifiants pour vous connecter.', de: 'Anmeldedaten eingeben, um sich anzumelden.', es: 'Introduce las credenciales para iniciar sesión.', pt: 'Introduza as credenciais para iniciar sessão.', ru: 'Введите учётные данные для входа.' },
  loggedOut:       { it: 'Operatore disconnesso.', en: 'Operator logged out.', fr: 'Opérateur déconnecté.', de: 'Bediener abgemeldet.', es: 'Operador desconectado.', pt: 'Operador desligado.', ru: 'Оператор вышел из системы.' },
  sessionExpired:  { it: 'Sessione operatore scaduta per inattività.', en: 'Operator session expired due to inactivity.', fr: 'Session opérateur expirée pour inactivité.', de: 'Bedienersitzung wegen Inaktivität abgelaufen.', es: 'Sesión de operador caducada por inactividad.', pt: 'Sessão do operador expirada por inatividade.', ru: 'Сеанс оператора завершён из-за неактивности.' },
  valueWritten:    { it: 'Scritto: {addr} = {val}', en: 'Written: {addr} = {val}', fr: 'Écrit : {addr} = {val}', de: 'Geschrieben: {addr} = {val}', es: 'Escrito: {addr} = {val}', pt: 'Escrito: {addr} = {val}', ru: 'Записано: {addr} = {val}' },
  scriptRun:       { it: 'Script {name} eseguito.', en: 'Script {name} executed.', fr: 'Script {name} exécuté.', de: 'Skript {name} ausgeführt.', es: 'Script {name} ejecutado.', pt: 'Script {name} executado.', ru: 'Скрипт {name} выполнен.' },
  scriptRunningTitle: { it: 'Esecuzione script', en: 'Running script', fr: 'Exécution du script', de: 'Skript wird ausgeführt', es: 'Ejecutando script', pt: 'A executar script', ru: 'Выполнение скрипта' },
  scriptRunningMsg:   { it: 'Esecuzione di “{name}” in corso…', en: 'Running “{name}”…', fr: 'Exécution de « {name} »…', de: '„{name}“ wird ausgeführt…', es: 'Ejecutando «{name}»…', pt: 'A executar “{name}”…', ru: 'Выполняется «{name}»…' },
  scriptOkTitle:      { it: 'Script completato', en: 'Script completed', fr: 'Script terminé', de: 'Skript abgeschlossen', es: 'Script completado', pt: 'Script concluído', ru: 'Скрипт завершён' },
  scriptOkMsg:        { it: 'Operazione completata correttamente.', en: 'Completed successfully.', fr: 'Terminé avec succès.', de: 'Erfolgreich abgeschlossen.', es: 'Completado correctamente.', pt: 'Concluído com sucesso.', ru: 'Успешно завершено.' },
  scriptErrorTitle:   { it: 'Errore script', en: 'Script error', fr: 'Erreur du script', de: 'Skriptfehler', es: 'Error de script', pt: 'Erro de script', ru: 'Ошибка скрипта' },
  scriptErrorMsg:     { it: 'Si è verificato un errore durante l’esecuzione.', en: 'An error occurred during execution.', fr: 'Une erreur s’est produite pendant l’exécution.', de: 'Bei der Ausführung ist ein Fehler aufgetreten.', es: 'Se produjo un error durante la ejecución.', pt: 'Ocorreu um erro durante a execução.', ru: 'Во время выполнения произошла ошибка.' },
  scriptAbortedTitle: { it: 'Script interrotto', en: 'Script aborted', fr: 'Script interrompu', de: 'Skript abgebrochen', es: 'Script cancelado', pt: 'Script interrompido', ru: 'Скрипт прерван' },
  scriptAbortedMsg:   { it: 'Esecuzione interrotta dall’operatore.', en: 'Execution aborted by the operator.', fr: 'Exécution interrompue par l’opérateur.', de: 'Ausführung vom Bediener abgebrochen.', es: 'Ejecución cancelada por el operador.', pt: 'Execução interrompida pelo operador.', ru: 'Выполнение прервано оператором.' },
  scriptAbort:        { it: 'Interrompi', en: 'Abort', fr: 'Interrompre', de: 'Abbrechen', es: 'Cancelar', pt: 'Interromper', ru: 'Прервать' },
  scriptAborting:     { it: 'Interruzione…', en: 'Aborting…', fr: 'Interruption…', de: 'Wird abgebrochen…', es: 'Cancelando…', pt: 'A interromper…', ru: 'Прерывание…' },
  scriptLogs:         { it: 'Dettagli', en: 'Details', fr: 'Détails', de: 'Details', es: 'Detalles', pt: 'Detalhes', ru: 'Подробности' },
  loggedInAs:      { it: 'Accesso: {user}', en: 'Logged in: {user}', fr: 'Connecté : {user}', de: 'Angemeldet: {user}', es: 'Conectado: {user}', pt: 'Ligado: {user}', ru: 'Вход: {user}' },
  user:            { it: 'Utente', en: 'User', fr: 'Utilisateur', de: 'Benutzer', es: 'Usuario', pt: 'Utilizador', ru: 'Пользователь' },
  password:        { it: 'Password', en: 'Password', fr: 'Mot de passe', de: 'Passwort', es: 'Contraseña', pt: 'Palavra-passe', ru: 'Пароль' },
  enterUsername:   { it: "Inserisci l'utente", en: 'Enter the username', fr: "Saisissez l'utilisateur", de: 'Benutzer eingeben', es: 'Introduce el usuario', pt: 'Introduza o utilizador', ru: 'Введите пользователя' },
  enterPassword:   { it: 'Inserisci la password', en: 'Enter the password', fr: 'Saisissez le mot de passe', de: 'Passwort eingeben', es: 'Introduce la contraseña', pt: 'Introduza a palavra-passe', ru: 'Введите пароль' },
  confirm:         { it: 'Conferma', en: 'Confirm', fr: 'Confirmer', de: 'Bestätigen', es: 'Confirmar', pt: 'Confirmar', ru: 'Подтвердить' },
  error:           { it: 'Errore', en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error', pt: 'Erro', ru: 'Ошибка' },

  // Runtime user administration (manageUsers surface)
  userManagement:  { it: 'Gestione utenti', en: 'User management', fr: 'Gestion des utilisateurs', de: 'Benutzerverwaltung', es: 'Gestión de usuarios', pt: 'Gestão de utilizadores', ru: 'Управление пользователями' },
  users:           { it: 'Utenti', en: 'Users', fr: 'Utilisateurs', de: 'Benutzer', es: 'Usuarios', pt: 'Utilizadores', ru: 'Пользователи' },
  userAdminLoginMsg: { it: 'Accedi con un account autorizzato alla gestione utenti.', en: 'Log in with an account allowed to manage users.', fr: 'Connectez-vous avec un compte autorisé à gérer les utilisateurs.', de: 'Mit einem Konto anmelden, das Benutzer verwalten darf.', es: 'Inicia sesión con una cuenta autorizada para gestionar usuarios.', pt: 'Inicie sessão com uma conta autorizada a gerir utilizadores.', ru: 'Войдите под учётной записью с правом управления пользователями.' },
  cannotManageUsers: { it: 'Questo account non può gestire gli utenti.', en: 'This account cannot manage users.', fr: 'Ce compte ne peut pas gérer les utilisateurs.', de: 'Dieses Konto kann keine Benutzer verwalten.', es: 'Esta cuenta no puede gestionar usuarios.', pt: 'Esta conta não pode gerir utilizadores.', ru: 'Эта учётная запись не может управлять пользователями.' },
  group:           { it: 'Gruppo', en: 'Group', fr: 'Groupe', de: 'Gruppe', es: 'Grupo', pt: 'Grupo', ru: 'Группа' },
  add:             { it: 'Aggiungi', en: 'Add', fr: 'Ajouter', de: 'Hinzufügen', es: 'Añadir', pt: 'Adicionar', ru: 'Добавить' },
  actions:         { it: 'Azioni', en: 'Actions', fr: 'Actions', de: 'Aktionen', es: 'Acciones', pt: 'Ações', ru: 'Действия' },
  active:          { it: 'attivo', en: 'active', fr: 'actif', de: 'aktiv', es: 'activo', pt: 'ativo', ru: 'активен' },
  inactive:        { it: 'inattivo', en: 'inactive', fr: 'inactif', de: 'inaktiv', es: 'inactivo', pt: 'inativo', ru: 'неактивен' },
  locked:          { it: 'bloccato', en: 'locked', fr: 'verrouillé', de: 'gesperrt', es: 'bloqueado', pt: 'bloqueado', ru: 'заблокирован' },
  unlock:          { it: 'Sblocca', en: 'Unlock', fr: 'Déverrouiller', de: 'Entsperren', es: 'Desbloquear', pt: 'Desbloquear', ru: 'Разблокировать' },
  deleteLabel:     { it: 'Elimina', en: 'Delete', fr: 'Supprimer', de: 'Löschen', es: 'Eliminar', pt: 'Eliminar', ru: 'Удалить' },
  orphaned:        { it: 'orfano', en: 'orphaned', fr: 'orphelin', de: 'verwaist', es: 'huérfano', pt: 'órfão', ru: 'осиротевший' },
  credentialsRequiredBoth: { it: 'Utente e password obbligatori', en: 'Username and password required', fr: 'Utilisateur et mot de passe requis', de: 'Benutzer und Passwort erforderlich', es: 'Usuario y contraseña obligatorios', pt: 'Utilizador e palavra-passe obrigatórios', ru: 'Требуются имя пользователя и пароль' },

  // New-batch form
  batchCode:         { it: 'Codice lotto', en: 'Batch code', fr: 'Code du lot', de: 'Chargencode', es: 'Código de lote', pt: 'Código do lote', ru: 'Код партии' },
  required:          { it: 'Obbligatorio', en: 'Required', fr: 'Obligatoire', de: 'Erforderlich', es: 'Obligatorio', pt: 'Obrigatório', ru: 'Обязательно' },
  batchPiecesTarget: { it: 'Pezzi lotto (target)', en: 'Batch pieces (target)', fr: 'Pièces du lot (cible)', de: 'Chargenstücke (Soll)', es: 'Piezas del lote (objetivo)', pt: 'Peças do lote (meta)', ru: 'Детали партии (цель)' },
  piecesPerBox:      { it: 'Pezzi per cartone', en: 'Pieces per box', fr: 'Pièces par carton', de: 'Stück pro Karton', es: 'Piezas por caja', pt: 'Peças por caixa', ru: 'Деталей в коробке' },
  batchDescription:  { it: 'Descrizione lotto', en: 'Batch description', fr: 'Description du lot', de: 'Chargenbeschreibung', es: 'Descripción del lote', pt: 'Descrição do lote', ru: 'Описание партии' },
  product:           { it: 'Prodotto', en: 'Product', fr: 'Produit', de: 'Produkt', es: 'Producto', pt: 'Produto', ru: 'Продукт' },
  customer:          { it: 'Cliente', en: 'Customer', fr: 'Client', de: 'Kunde', es: 'Cliente', pt: 'Cliente', ru: 'Клиент' },

  // Info rows
  code:      { it: 'Codice', en: 'Code', fr: 'Code', de: 'Code', es: 'Código', pt: 'Código', ru: 'Код' },
  state:     { it: 'Stato', en: 'State', fr: 'État', de: 'Status', es: 'Estado', pt: 'Estado', ru: 'Состояние' },
  target:    { it: 'Target', en: 'Target', fr: 'Cible', de: 'Soll', es: 'Objetivo', pt: 'Meta', ru: 'Цель' },
  produced:  { it: 'Prodotti', en: 'Produced', fr: 'Produits', de: 'Produziert', es: 'Producidos', pt: 'Produzidos', ru: 'Произведено' },
  box:       { it: 'Cartone', en: 'Box', fr: 'Carton', de: 'Karton', es: 'Caja', pt: 'Caixa', ru: 'Коробка' },
  rejects:   { it: 'Scarti', en: 'Rejects', fr: 'Rebuts', de: 'Ausschuss', es: 'Rechazos', pt: 'Rejeitados', ru: 'Брак' },
  noActiveBatch: { it: 'Nessun lotto attivo', en: 'No active batch', fr: 'Aucun lot actif', de: 'Keine aktive Charge', es: 'Ningún lote activo', pt: 'Nenhum lote ativo', ru: 'Нет активной партии' },

  // Messages / close dialog
  batchOpened:  { it: 'Lotto {batch} aperto', en: 'Batch {batch} opened', fr: 'Lot {batch} ouvert', de: 'Charge {batch} geöffnet', es: 'Lote {batch} abierto', pt: 'Lote {batch} aberto', ru: 'Партия {batch} открыта' },
  batchClosed:  { it: 'Lotto chiuso', en: 'Batch closed', fr: 'Lot fermé', de: 'Charge geschlossen', es: 'Lote cerrado', pt: 'Lote fechado', ru: 'Партия закрыта' },
  closeError:   { it: 'Errore chiusura', en: 'Close error', fr: 'Erreur de fermeture', de: 'Fehler beim Schließen', es: 'Error al cerrar', pt: 'Erro ao fechar', ru: 'Ошибка закрытия' },
  editBatch:    { it: 'Modifica lotto', en: 'Edit batch', fr: 'Modifier le lot', de: 'Charge bearbeiten', es: 'Editar lote', pt: 'Editar lote', ru: 'Изменить партию' },
  saveChanges:  { it: 'Salva modifiche', en: 'Save changes', fr: 'Enregistrer', de: 'Änderungen speichern', es: 'Guardar cambios', pt: 'Guardar alterações', ru: 'Сохранить изменения' },
  batchUpdated: { it: 'Lotto aggiornato', en: 'Batch updated', fr: 'Lot mis à jour', de: 'Charge aktualisiert', es: 'Lote actualizado', pt: 'Lote atualizado', ru: 'Партия обновлена' },
  updateError:  { it: 'Errore modifica', en: 'Update error', fr: 'Erreur de modification', de: 'Fehler bei der Änderung', es: 'Error al actualizar', pt: 'Erro ao atualizar', ru: 'Ошибка изменения' },
  closeBatch:   { it: 'Chiudi lotto', en: 'Close batch', fr: 'Fermer le lot', de: 'Charge schließen', es: 'Cerrar lote', pt: 'Fechar lote', ru: 'Закрыть партию' },
  cancel:       { it: 'Annulla', en: 'Cancel', fr: 'Annuler', de: 'Abbrechen', es: 'Cancelar', pt: 'Cancelar', ru: 'Отмена' },
  closeBatchQuestion: { it: 'Chiudere il lotto?', en: 'Close the batch?', fr: 'Fermer le lot ?', de: 'Charge schließen?', es: '¿Cerrar el lote?', pt: 'Fechar o lote?', ru: 'Закрыть партию?' },
  closeBatchWarning:  { it: "Il lotto {batch} verrà terminato. L'operazione non è reversibile.", en: 'Batch {batch} will be finished. This cannot be undone.', fr: 'Le lot {batch} sera terminé. Cette opération est irréversible.', de: 'Charge {batch} wird abgeschlossen. Dieser Vorgang kann nicht rückgängig gemacht werden.', es: 'El lote {batch} se finalizará. Esta operación no se puede deshacer.', pt: 'O lote {batch} será terminado. Esta operação não pode ser anulada.', ru: 'Партия {batch} будет завершена. Это действие нельзя отменить.' },

  // Batch states (legacy BATCH_STATE codes)
  stateProduce:   { it: 'Da produrre', en: 'To produce', fr: 'À produire', de: 'Zu produzieren', es: 'Por producir', pt: 'A produzir', ru: 'К производству' },
  stateReceived:  { it: 'Ricevuto', en: 'Received', fr: 'Reçu', de: 'Empfangen', es: 'Recibido', pt: 'Recebido', ru: 'Получено' },
  stateRunning:   { it: 'In esecuzione', en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En ejecución', pt: 'Em execução', ru: 'Выполняется' },
  stateToFinish:  { it: 'Da terminare', en: 'To finish', fr: 'À terminer', de: 'Abzuschließen', es: 'Por finalizar', pt: 'A terminar', ru: 'К завершению' },
  stateFinished:  { it: 'Terminato', en: 'Finished', fr: 'Terminé', de: 'Abgeschlossen', es: 'Finalizado', pt: 'Terminado', ru: 'Завершено' },
  stateSuspended: { it: 'Sospeso', en: 'Suspended', fr: 'Suspendu', de: 'Ausgesetzt', es: 'Suspendido', pt: 'Suspenso', ru: 'Приостановлено' },

  // Alarm severities (shown in the cycling banner tooltip and active-alarms popup)
  sevInfo:     { it: 'Info', en: 'Info', fr: 'Info', de: 'Info', es: 'Info', pt: 'Info', ru: 'Инфо' },
  sevWarning:  { it: 'Avviso', en: 'Warning', fr: 'Avertissement', de: 'Warnung', es: 'Aviso', pt: 'Aviso', ru: 'Предупреждение' },
  sevError:    { it: 'Errore', en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error', pt: 'Erro', ru: 'Ошибка' },
  sevCritical: { it: 'Critico', en: 'Critical', fr: 'Critique', de: 'Kritisch', es: 'Crítico', pt: 'Crítico', ru: 'Критично' },

  // Value-entry dialog (write a PLC value from a runtime Entry/Grid widget)
  setValue:        { it: 'Imposta valore', en: 'Set value', fr: 'Définir la valeur', de: 'Wert festlegen', es: 'Establecer valor', pt: 'Definir valor', ru: 'Задать значение' },
  currentValue:    { it: 'Valore attuale', en: 'Current value', fr: 'Valeur actuelle', de: 'Aktueller Wert', es: 'Valor actual', pt: 'Valor atual', ru: 'Текущее значение' },
  commentOptional: { it: 'Commento (facoltativo)', en: 'Comment (optional)', fr: 'Commentaire (facultatif)', de: 'Kommentar (optional)', es: 'Comentario (opcional)', pt: 'Comentário (opcional)', ru: 'Комментарий (необязательно)' },
  commentRequired: { it: 'Commento (obbligatorio)', en: 'Comment (required)', fr: 'Commentaire (obligatoire)', de: 'Kommentar (erforderlich)', es: 'Comentario (obligatorio)', pt: 'Comentário (obrigatório)', ru: 'Комментарий (обязательно)' },
  commentRequiredError: { it: 'È obbligatorio inserire un commento.', en: 'A comment is required.', fr: 'Un commentaire est obligatoire.', de: 'Ein Kommentar ist erforderlich.', es: 'Es obligatorio introducir un comentario.', pt: 'É obrigatório introduzir um comentário.', ru: 'Необходимо ввести комментарий.' },
  reasonForChange: { it: 'Motivo della modifica…', en: 'Reason for the change…', fr: 'Motif de la modification…', de: 'Grund der Änderung…', es: 'Motivo del cambio…', pt: 'Motivo da alteração…', ru: 'Причина изменения…' },

  // Runtime page loading / error states
  loadingPage: { it: 'Caricamento pagina…', en: 'Loading page…', fr: 'Chargement de la page…', de: 'Seite wird geladen…', es: 'Cargando página…', pt: 'A carregar página…', ru: 'Загрузка страницы…' },
  loadError:   { it: 'Errore caricamento', en: 'Loading error', fr: 'Erreur de chargement', de: 'Ladefehler', es: 'Error de carga', pt: 'Erro de carregamento', ru: 'Ошибка загрузки' },
  home:        { it: 'Home', en: 'Home', fr: 'Accueil', de: 'Startseite', es: 'Inicio', pt: 'Início', ru: 'Главная' },
  retry:       { it: 'Riprova', en: 'Retry', fr: 'Réessayer', de: 'Erneut versuchen', es: 'Reintentar', pt: 'Tentar novamente', ru: 'Повторить' },

  // Virtual on-screen keyboard
  openKeyboard:   { it: 'Apri tastiera a schermo', en: 'Open on-screen keyboard', fr: 'Ouvrir le clavier à l’écran', de: 'Bildschirmtastatur öffnen', es: 'Abrir teclado en pantalla', pt: 'Abrir teclado no ecrã', ru: 'Открыть экранную клавиатуру' },
  virtualKeyboard:{ it: 'Tastiera virtuale', en: 'Virtual keyboard', fr: 'Clavier virtuel', de: 'Virtuelle Tastatur', es: 'Teclado virtual', pt: 'Teclado virtual', ru: 'Виртуальная клавиатура' },
  numericKeypad:  { it: 'Tastierino numerico', en: 'Numeric keypad', fr: 'Pavé numérique', de: 'Nummernblock', es: 'Teclado numérico', pt: 'Teclado numérico', ru: 'Цифровая клавиатура' },
  keyboard:       { it: 'Tastiera', en: 'Keyboard', fr: 'Clavier', de: 'Tastatur', es: 'Teclado', pt: 'Teclado', ru: 'Клавиатура' },
  tapFieldToType: { it: 'Tocca un campo da compilare per iniziare a scrivere', en: 'Tap a field to start typing', fr: 'Touchez un champ à remplir pour commencer à écrire', de: 'Tippen Sie auf ein Feld, um mit der Eingabe zu beginnen', es: 'Toca un campo para empezar a escribir', pt: 'Toque num campo para começar a escrever', ru: 'Коснитесь поля, чтобы начать ввод' },
  allowedValue:   { it: 'Valore ammesso', en: 'Allowed value', fr: 'Valeur admise', de: 'Zulässiger Wert', es: 'Valor admitido', pt: 'Valor permitido', ru: 'Допустимое значение' },
  keyEnter:       { it: 'Invio', en: 'Enter', fr: 'Entrée', de: 'Eingabe', es: 'Intro', pt: 'Enter', ru: 'Ввод' },
  keySpace:       { it: 'Spazio', en: 'Space', fr: 'Espace', de: 'Leertaste', es: 'Espacio', pt: 'Espaço', ru: 'Пробел' },

  // Cycling-alarms banner / popup chrome
  activeAlarms:     { it: 'Allarmi attivi', en: 'Active alarms', fr: 'Alarmes actives', de: 'Aktive Alarme', es: 'Alarmas activas', pt: 'Alarmes ativos', ru: 'Активные аварии' },
  showActiveAlarms: { it: 'Mostra allarmi attivi', en: 'Show active alarms', fr: 'Afficher les alarmes actives', de: 'Aktive Alarme anzeigen', es: 'Mostrar alarmas activas', pt: 'Mostrar alarmes ativos', ru: 'Показать активные аварии' },
  noActiveAlarms:   { it: 'Nessun allarme attivo', en: 'No active alarms', fr: 'Aucune alarme active', de: 'Keine aktiven Alarme', es: 'Ninguna alarma activa', pt: 'Nenhum alarme ativo', ru: 'Нет активных аварий' },
}

/**
 * True if `text` equals any language variant of the UI string `key`. Used to tell
 * a leftover built-in default (in any language) from a genuinely custom override,
 * so the former can be re-localized to the active language.
 */
export function isUiString(key, text) {
  const entry = UI[key]
  if (!entry || text == null) return false
  const s = String(text).trim()
  return Object.values(entry).some((v) => v === s)
}

/** Resolve a UI-string key for `lang`, interpolating {placeholders} from `vars`. */
export function t(key, lang, defaultLang = 'it', vars) {
  const entry = UI[key]
  let s = entry ? resolveText(entry, lang, defaultLang) : key
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]))
  return s
}
