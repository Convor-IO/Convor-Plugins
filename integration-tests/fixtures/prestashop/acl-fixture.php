<?php
// Only executed via docker exec in the isolated named acceptance fixture.
if (PHP_SAPI !== 'cli') exit(1);
require '/var/www/html/config/config.inc.php';
require_once '/var/www/html/modules/convor/convor.php';
$name = 'Convor restricted module QA';
$email = 'convor-acl-' . getenv('CONVOR_QA_ACL_SUFFIX') . '@example.test';
if (!preg_match('/^convor-acl-[a-f0-9]{16}@example\.test$/D', $email)) {
    throw new RuntimeException('Not a synthetic ACL employee');
}
$profileId = (int) getenv('CONVOR_QA_ACL_PROFILE');
$employeeId = (int) getenv('CONVOR_QA_ACL_EMPLOYEE');
function cleanup($employeeId, $profileId, $email, $name) {
    if ($employeeId > 1) {
        $e = new Employee($employeeId);
        if (!$e->id || $e->email !== $email || (int)$e->id_profile !== $profileId || !$e->delete()) {
            throw new RuntimeException('Failed to remove owned ACL employee');
        }
    }
    if ($profileId > 4) {
        $p = new Profile($profileId, 1);
        if (!$p->id || $p->name !== $name || !$p->delete()) {
            throw new RuntimeException('Failed to remove owned ACL profile');
        }
    }
}
$action = getenv('CONVOR_QA_ACL_ACTION');
if ($action === 'remove') {
    cleanup($employeeId, $profileId, $email, $name);
    echo json_encode(array('removed'=>true));
    exit;
}
if ($action === 'state') {
    $m = Module::getInstanceByName('convor');
    echo json_encode(array('digest'=>hash('sha256', json_encode($m->settings(), JSON_THROW_ON_ERROR))));
    exit;
}
if ($action !== 'create') exit(1);
$p = new Profile();
$p->name = array_fill_keys(array_map('intval', Language::getIDs(false)), $name);
if (!$p->add()) throw new RuntimeException('Cannot create ACL profile');
$profileId=(int)$p->id;
$employeeId=0;
try {
    $access = new Access();
    // Can browse the dashboard and Module Manager; cannot configure Convor.
    foreach (array('AdminDashboard', 'AdminModulesManage') as $tab) {
        $id = (int) Tab::getIdFromClassName($tab);
        if (!$id || $access->updateLgcAccess($profileId, $id, 'view', true, false) !== 'ok') {
            throw new RuntimeException('Unable to grant read-only tab access');
        }
    }
    $m = Module::getInstanceByName('convor');
    if ($access->updateLgcModuleAccess($profileId, (int)$m->id, 'view', true) !== 'ok') {
        throw new RuntimeException('Unable to grant module view');
    }
    $e = new Employee();
    $e->id_profile=$profileId;
    $e->id_lang=1;
    $e->firstname='Convor';
    $e->lastname='Restricted QA';
    $e->email=$email;
    $e->active=true;
    $e->passwd=Tools::hash(getenv('CONVOR_QA_ACL_PASSWORD'));
    $e->default_tab=(int)Tab::getIdFromClassName('AdminDashboard');
    if (!$e->add()) throw new RuntimeException('Unable to create employee');
    $employeeId=(int)$e->id;
    $e->associateTo(array(1));
    // Confirm the credential actually persisted and is recognized by the
    // platform authentication path (never print the password or hash).
    $check = new Employee();
    if (!$check->getByEmail($email, getenv('CONVOR_QA_ACL_PASSWORD')) || (int)$check->id !== $employeeId) {
        throw new RuntimeException('Fixture credential is not accepted by Employee::getByEmail');
    }
    if (!$m->getPermission('view',$e) || $m->getPermission('configure',$e)) {
        throw new RuntimeException('Profile does not have intended read-only access');
    }
    echo json_encode(array('employee'=>$employeeId, 'profile'=>$profileId), JSON_THROW_ON_ERROR);
} catch(Throwable $e) {
    cleanup($employeeId, $profileId, $email, $name);
    throw $e;
}
