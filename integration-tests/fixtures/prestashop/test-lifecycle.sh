#!/usr/bin/env bash
# Real module lifecycle on the disposable PS 8.2.9 compatibility fixture.
# Never execute this against a live shop. No merchant or production data.
set -euo pipefail
cd "$(dirname "$0")/../../.."
container=convor-prestashop-1807-82-prestashop-1
label=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")
[[ "$label" == "convor-prestashop-1807-82" ]]
case "$(docker inspect -f '{{.Config.Image}}' "$container")" in
  prestashop/prestashop:8.2.9|prestashop/prestashop:8.2.9@sha256:05f4a15cee2a0480cd8602f97efbcef8262517d5a3030b661786ff71fe8fcd16) ;;
  *) echo "Unexpected fixture image" >&2; exit 1 ;;
esac
source dist/prestashop-qa.env
# Obtain the synthetic public key from our isolated real SaaS.
export CONVOR_QA_PUBLIC_KEY="$(node --input-type=module <<'JS'
const api=process.env.CONVOR_API_URL, dashboard=process.env.CONVOR_DASHBOARD_URL;
if(new URL(api).origin!=="http://localhost:17243") throw Error("QA only");
const login=await fetch(api+"/api/auth/sign-in/email",{method:"POST",headers:{Origin:dashboard,"Content-Type":"application/json"},body:JSON.stringify({email:process.env.CONVOR_TEST_EMAIL,password:process.env.CONVOR_TEST_PASSWORD})});
if(!login.ok)throw Error("Fixture login");
const cookie=login.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
const response=await fetch(api+"/api/projects/"+process.env.CONVOR_PROJECT_ID,{headers:{cookie,Origin:dashboard,"X-Organization-Id":process.env.CONVOR_ORG_ID,"X-Project-Id":process.env.CONVOR_PROJECT_ID}});
if(!response.ok)throw Error("Fixture project");
const key=(await response.json()).project.widgetPublicKey;
if(!/^convor_wpk_[a-f0-9]{64}$/.test(key)) throw Error("Unexpected public key");
process.stdout.write(key);
JS
)"
# Build the historical 1.0.0 module from the audited original source, without
# touching another checkout. The new archive is the exact release candidate.
old=dist/prestashop-lifecycle-old
mkdir -p "$old"
git archive 5179781 prestashop | tar -x -C "$old"
console() {
  docker exec -u www-data "$container" php /var/www/html/bin/console --env=prod prestashop:module "$@" --no-interaction
}
install_candidate() {
  docker cp dist/prestashop/convor.zip "$container:/var/www/html/convor-qa.zip"
  docker exec "$container" sh -ec 'unzip -oq /var/www/html/convor-qa.zip -d /var/www/html/modules; rm /var/www/html/convor-qa.zip; chown -R www-data:www-data /var/www/html/modules/convor'
}
for variant in valid legacy; do
  console uninstall convor
  console delete convor
  docker cp "$old/prestashop" "$container:/var/www/html/modules/convor"
  docker exec "$container" chown -R www-data:www-data /var/www/html/modules/convor
  console install convor
  # Use actual Configuration API to reproduce a prior merchant's saved value.
  docker exec -e CONVOR_QA_PUBLIC_KEY -e CONVOR_QA_VARIANT="$variant" -u www-data "$container" php -r '
    require "/var/www/html/config/config.inc.php";
    $value=getenv("CONVOR_QA_VARIANT")==="valid"?getenv("CONVOR_QA_PUBLIC_KEY"):"old-organization-slug";
    if(!Configuration::updateValue("CONVOR_ORG_SLUG",$value) || !Configuration::updateValue("CONVOR_ENABLED",1)) exit(1);
  '
  install_candidate
  console upgrade convor
  docker exec -e CONVOR_QA_PUBLIC_KEY -e CONVOR_QA_VARIANT="$variant" -u www-data "$container" php -r '
    require "/var/www/html/config/config.inc.php";
    $shop=1;
    $settings=json_decode(Configuration::get("CONVOR_WIDGET_SETTINGS",null,null,$shop),true,512,JSON_THROW_ON_ERROR);
    $expected=getenv("CONVOR_QA_VARIANT")==="valid"?getenv("CONVOR_QA_PUBLIC_KEY"):"";
    if(($settings["widget_key"]??null)!==$expected || ($settings["shop_id"]??null)!==$shop) exit(2);
    echo "PASS migrated ".getenv("CONVOR_QA_VARIANT")." input\n";
  '
done
console uninstall convor
docker exec -u www-data "$container" php -r '
require "/var/www/html/config/config.inc.php";
foreach (["CONVOR_WIDGET_SETTINGS","CONVOR_ORG_SLUG","CONVOR_ENABLED","CONVOR_API_BASE"] as $key) {
  if (Configuration::get($key)!==false) exit(2);
}
echo "PASS uninstall clears configuration\n";
'
console install convor
# Restore a usable anonymous configuration for this disposable store.
docker exec -e CONVOR_QA_PUBLIC_KEY -u www-data "$container" php -r '
require "/var/www/html/config/config.inc.php";
require_once "/var/www/html/modules/convor/convor.php";
$s=Convor::defaults();$s["widget_key"]=getenv("CONVOR_QA_PUBLIC_KEY");$s["enabled"]=true;$s["shop_id"]=1;
if(!Configuration::updateValue(Convor::SETTINGS,json_encode($s,JSON_THROW_ON_ERROR),false,null,1))exit(1);
'
docker exec "$container" apache2ctl graceful
echo 'PASS: real 1.0.0→1.1.0 upgrade and uninstall/reinstall on PS8.2.9'
