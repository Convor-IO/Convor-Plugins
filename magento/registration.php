<?php
/**
 * Convor Widget module registration.
 *
 * @package Convor_Widget
 */

declare(strict_types=1);

use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    'Convor_Widget',
    __DIR__
);
