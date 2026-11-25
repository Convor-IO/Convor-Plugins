<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<main>
	<h1><?php bloginfo( 'name' ); ?></h1>
	<?php while ( have_posts() ) : the_post(); ?>
		<article><h2><?php the_title(); ?></h2><?php the_content(); ?></article>
	<?php endwhile; ?>
</main>
<?php
$key = get_option( 'convor_qa_theme_public_key' );
$src = ( getenv( 'CONVOR_FIXTURE_PUBLIC_API_URL' ) ?: 'http://localhost:17203' ) . '/widget.js';
if ( is_string( $key ) && preg_match( '/^convor_wpk_[a-f0-9]{64}$/D', $key ) ) :
	?>
	<script src="<?php echo esc_url( $src ); ?>" data-key="<?php echo esc_attr( $key ); ?>" async></script>
	<?php
endif;
wp_footer();
?>
</body>
</html>
