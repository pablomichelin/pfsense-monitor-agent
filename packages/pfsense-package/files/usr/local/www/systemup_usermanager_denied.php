<?php
/**
 * Pagina de recusa quando um tecnico tenta mexer em admin/root no User Manager.
 */

require_once('guiconfig.inc');

$pgtitle = [gettext('System'), gettext('User Manager'), gettext('Negado')];
include('head.inc');
?>
<div class="alert alert-danger" role="alert">
  <strong>Conta protegida.</strong>
  Os usuários <code>admin</code> e <code>root</code> não podem ser criados, editados ou excluídos por um técnico.
  Use outra conta para usuários de OpenVPN e demais acessos.
</div>
<p>
  <a href="/system_usermanager.php" class="btn btn-primary">Voltar ao User Manager</a>
</p>
<?php
include('foot.inc');
