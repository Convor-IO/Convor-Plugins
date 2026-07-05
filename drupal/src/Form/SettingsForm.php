<?php

declare(strict_types=1);

namespace Drupal\convor_widget\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configure the Convor widget embed.
 *
 * Stores the organization slug (the public key emitted as data-key on the
 * widget <script> tag), the CDN/API base the script is loaded from, and a
 * master enable toggle in the convor_widget.settings config object.
 */
final class SettingsForm extends ConfigFormBase {

  /**
   * The default CDN/API base used when no value is configured.
   */
  public const DEFAULT_API_BASE = 'https://cdn.convor.io';

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'convor_widget_settings';
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['convor_widget.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('convor_widget.settings');

    $form['enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable the Convor widget'),
      '#description' => $this->t('When checked, the widget script is injected on every page using the organization slug below. Uncheck to disable the widget without removing your settings.'),
      '#default_value' => (bool) $config->get('enabled'),
    ];

    $form['org_slug'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Organization slug'),
      '#description' => $this->t('The public organization slug from your Convor dashboard (also used as the <em>data-key</em> on the widget script tag).'),
      '#default_value' => (string) $config->get('org_slug'),
      '#required' => TRUE,
      '#attributes' => [
        'placeholder' => 'my-organization',
        'autocomplete' => 'off',
      ],
    ];

    $form['api_base'] = [
      '#type' => 'url',
      '#title' => $this->t('Widget script base URL'),
      '#description' => $this->t('Absolute URL of the Convor CDN/API serving <code>widget.js</code>. Leave blank to use the default (%default).', ['%default' => self::DEFAULT_API_BASE]),
      '#default_value' => (string) $config->get('api_base'),
      '#attributes' => [
        'placeholder' => self::DEFAULT_API_BASE,
      ],
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);

    $slug = (string) $form_state->getValue('org_slug');
    // Convor org slugs are URL-safe: lowercase letters, digits, and hyphens.
    // We allow uppercase for ergonomics but normalize to lowercase on save.
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/', $slug)) {
      $form_state->setErrorByName('org_slug', $this->t('The organization slug may only contain letters, numbers, and hyphens, and must be 1–64 characters long.'));
    }

    $api_base = trim((string) $form_state->getValue('api_base'));
    if ($api_base !== '') {
      // Reject obviously malformed values; the #type => 'url' field handles
      // most validation, but this normalizes trailing slashes too.
      if (!filter_var($api_base, FILTER_VALIDATE_URL)) {
        $form_state->setErrorByName('api_base', $this->t('The widget script base URL must be a valid absolute URL.'));
      }
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $api_base = trim((string) $form_state->getValue('api_base'));
    if ($api_base === '') {
      $api_base = self::DEFAULT_API_BASE;
    }

    $this->config('convor_widget.settings')
      ->set('enabled', (bool) $form_state->getValue('enabled'))
      ->set('org_slug', strtolower(trim((string) $form_state->getValue('org_slug'))))
      ->set('api_base', rtrim($api_base, '/'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
