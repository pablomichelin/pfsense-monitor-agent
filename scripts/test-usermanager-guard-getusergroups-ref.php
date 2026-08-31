<?php
/**
 * Garante que o guard nao passa expressao para getUserGroups() (3o arg e referencia).
 * Um `$_SESSION[...] ?? null` nesse argumento e Fatal PHP 8 → 50x ao Salvar.
 */
$root = dirname(__DIR__);
$guard = $root . '/packages/pfsense-package/files/usr/local/pkg/systemup_usermanager_guard.inc';
$src = file_get_contents($guard);
if ($src === false) {
    fwrite(STDERR, "cannot read guard\n");
    exit(2);
}

if (!preg_match('/getUserGroups\s*\([^;]*\$radiusAttributes\s*,?\s*\)/s', $src)) {
    fwrite(STDERR, "FAIL: getUserGroups deve receber \$radiusAttributes (variavel) no 3o argumento\n");
    exit(1);
}
if (preg_match('/getUserGroups\s*\([^;]*user_radius_attributes[^;]*\?\?/s', $src)) {
    fwrite(STDERR, "FAIL: getUserGroups ainda passa user_radius_attributes ?? (nao e variavel)\n");
    exit(1);
}
if (strpos($src, 'usernamefld') === false) {
    fwrite(STDERR, "FAIL: guard precisa checar usernamefld (campo real do POST)\n");
    exit(1);
}
echo "static-ok\n";

function getUserGroups($username, $authcfg, &$attributes = array())
{
    if (!is_array($attributes)) {
        $attributes = array();
    }
    $attributes['seen'] = true;

    return array('all');
}

try {
    getUserGroups('tech', null, $_SESSION['user_radius_attributes'] ?? null);
    fwrite(STDERR, "FAIL: expressao ?? deveria ser Fatal/Error\n");
    exit(1);
} catch (Throwable $e) {
    echo 'ref-fatal-ok: ' . $e->getMessage() . "\n";
}

$radiusAttributes = array();
$groups = getUserGroups('tech', null, $radiusAttributes);
if ($groups !== array('all') || empty($radiusAttributes['seen'])) {
    fwrite(STDERR, "FAIL: chamada com variavel deveria funcionar\n");
    exit(1);
}
echo "ref-var-ok\n";
